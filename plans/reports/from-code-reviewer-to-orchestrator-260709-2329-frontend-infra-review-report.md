# Frontend + Infra Review — 2026-07-09

Scope: apps/frontend (lib, middleware, app pages, hooks, social components), docker-compose.yml, nginx/*, ci.yml, Dockerfiles, monitoring (skim). Advisory — không sửa code.

## Critical

**C1. Config bake build-time — root cause incident (b).** `apps/frontend/Dockerfile:14` default `NEXT_PUBLIC_API_URL=http://localhost/api`; compose:155 chỉ override khi `PUBLIC_API_URL` set. Bị inline vào: `src/lib/constants.ts:1` (API_URL), `constants.ts:3` (API_ASSET_ORIGIN → OG image, click redirect), `src/lib/socket.ts:8` (parse env lặp lại), `next.config.ts:4-17` (images.remotePatterns cho /uploads cũng theo hostname bake → Image optimizer hỏng luôn). 1 image ≠ nhiều môi trường.
→ **Fix KISS: relative `/api`.** Nginx đã same-origin toàn bộ (`nginx/snippets/app-locations.conf:47,8,21,67`): `API_URL='/api'`, EventSource/`io()`/`/uploads`/`/r/` đều chạy relative; xóa hẳn class lỗi này, image build 1 lần chạy mọi env. Giữ env override cho dev local (backend port trực tiếp). `SITE_URL` (constants.ts:4) chuyển thành server-runtime env (không có ARG trong Dockerfile → staging hiện luôn ra `https://shopee.review`).

**C2. Secret fallback im lặng.** `docker-compose.yml:112,162` `JWT_SECRET:-change-me-to-a-long-random-string` — quên set env → cả backend lẫn middleware verify bằng secret công khai trong repo → forge token được. Kèm `middleware.ts:9-17`: không có JWT_SECRET → "presence-only check" pass mọi cookie. `ADMIN_TOKEN`, `MEILI_MASTER_KEY`, DB password (compose:7,51,83,107) cùng pattern hardcode/default.
→ Fail-fast: bỏ default cho secrets (`${JWT_SECRET:?required}`), middleware throw khi thiếu secret ở production.

## High

**H1. Data-cache stale — root cause incident (a).** `src/lib/api.ts:99,104,107,109,220`: fetch-level `next.revalidate` tạo shared data-cache dù page `force-dynamic` (`app/page.tsx:8`) — force-dynamic chỉ tắt route cache, KHÔNG tắt fetch data cache. Kết quả rỗng 200 (trước seed) bị cache; revalidate lỗi/serve-stale + `page.tsx:21-23` catch nuốt lỗi → stale-empty tới khi restart. Không có tag → không thể invalidate on-demand.
→ Systemic: (1) explore/feed/trending trên page dynamic → `cache: 'no-store'` (nginx microcache 2s đã gánh hot path); (2) semi-static (post detail, categories) → `next: { tags: ['post:{id}','categories'] }` + `revalidateTag` từ route handler gọi sau mutation/seed; (3) không cache khi `data.length === 0` nếu giữ revalidate; (4) bỏ catch-render-empty, để error boundary hiện lỗi thật.

**H2. `/api/auth/me` dính auth_limit 5r/m.** `nginx/snippets/app-locations.conf:34-37` zone `auth_limit` (nginx.conf:40, 5r/m burst 5) áp cả `/api/auth/`; `auth-context.tsx:41-43` gọi `/auth/me` mỗi hard-load. Vài reload hoặc NAT chung IP → 429 → `refresh()` catch → `setUser(null)` (auth-context.tsx:26-27) → user "bị logout" ngẫu nhiên, mọi trang client-guard đá về /auth/login.
→ Tách `location = /api/auth/me` dùng api_limit; auth_limit chỉ cho login/register/forgot.

**H3. X-Forwarded-Proto sai sau Traefik + port bypass.** `app-locations.conf:5` set `X-Forwarded-Proto $scheme` = luôn `http` (Traefik terminate TLS rồi forward HTTP vào nginx:80, compose:196-204) → backend thấy http: secure-cookie/redirect/canonical sai. Compose:183 `ports: "8081:80"` publish thẳng host → truy cập bypass Traefik TLS/redirect.
→ Dùng `$http_x_forwarded_proto` (fallback $scheme); bind `127.0.0.1:8081:80` hoặc bỏ ports.

**H4. Reaction rapid-toggle race.** `reaction-button.tsx:49-52,68`: không optimistic, không pending-guard, không mutation key. 2 tap nhanh: tap2 đọc `current` cũ → server PUT toggle 2 lần (like rồi un-like), responses out-of-order → `setQueryData` cuối là response cũ → UI hiển thị sai vĩnh viễn tới refetch. So sánh: bookmark-button.tsx:42 có `disabled={pending}` đúng chuẩn.
→ Optimistic `onMutate` + `cancelQueries` + rollback (như follow-button.tsx:41-49), hoặc tối thiểu disable khi isPending.

**H5. CI không thể bắt incident (b), gaps lớn.** `.github/workflows/ci.yml`: (1) không build docker image — bug port-80 bake nằm ở Dockerfile ARG default, CI build bằng env đúng (dòng 34) nên pass; (2) zero frontend test, không lint (chỉ typecheck dòng 28-29); (3) không e2e/smoke.
→ Minimal gate: job `docker compose build frontend` (không truyền PUBLIC_API_URL) + run container + `grep -r "http://localhost/api" .next/static` phải fail; hoặc adopt C1 relative-/api thì gate chỉ còn smoke `curl /`. Thêm `next lint` + 1 smoke e2e (login → post → react).

## Medium

**M1. /admin chỉ client-gate.** `middleware.ts:26-40` chỉ verify token, không check role; `admin/page.tsx:22-26` redirect client-side. Mọi user login load được shell /admin (data thì backend 403 — cần xác nhận). → decode claim `isAdmin` trong middleware nếu JWT có; nếu không, thêm claim.

**M2. depends_on không dùng healthcheck.** compose:132-140,61-63,91-93 `service_started` dù db/redis/meili có healthcheck → backend chạy `prisma migrate deploy` (backend Dockerfile:32) khi Postgres chưa sẵn sàng, crash-loop lúc cold start. → `condition: service_healthy`.

**M3. SPOF + backup chưa drill.** Mọi service 1 instance, 1 host; `db-backup` (compose:75-93) dump vào `./backups` cùng host — mất host mất luôn backup; chưa có restore drill/verify. Không resource limits (trừ meili mem_limit:232) → 1 service leak kéo sập cả node. → offsite backup (R2 sẵn creds), restore test định kỳ, mem/cpu limits cho backend/frontend/redis.

**M4. SSE bỏ cuộc sau 5 lần, không phân biệt nguyên nhân.** `use-notifications.ts:44,65-73`: mạng chập/sleep >5 lần → notifications chết im lặng đến khi remount. → phân biệt 401 (dừng) vs network (backoff mũ, không giới hạn); comment hiện tại nhận sai trade-off.

**M5. SEO post detail.** `[postId]/page.tsx`: username segment không validate với `post.user.username` → `/bat-ky-ai/123` render 200 → duplicate content; thiếu `alternates.canonical` + `openGraph.url`. `sitemap.ts:12` chỉ 50 bài mới nhất — growth loop cụt. → validate username → redirect canonical; sitemap phân trang. Post detail nên là ISR + tag (khớp H1 fix) — hot path share từ social.

**M6. nginx microcache/rate-limit lỗ hổng nhỏ.** Set-Cookie an toàn (không `proxy_ignore_headers` → nginx mặc định không cache response có Set-Cookie) nhưng: thiếu `proxy_cache_lock on` (stampede khi cache miss đồng loạt); `location /r/` (app-locations.conf:67) và `location /` (dòng 97) không rate-limit — `/r/` là click-count endpoint → click-fraud/inflate affiliate stats không giới hạn. `client_max_body_size 12m` (nginx.conf:25) — cần xác nhận parity với multer/limit backend.

**M7. Lỗi bị nuốt hàng loạt.** Pattern `.catch(() => undefined)`: dashboard/page.tsx:24-26, settings:40, admin:17, search:38, saved:29, use-notifications:30,34 — API chết → trang trắng dữ liệu không thông báo, không retry/backoff ở `apiFetch` (api.ts:25-50). `notifications/page.tsx:41` `void markAllRead()` → unhandled rejection. → tối thiểu error state + toast; cân nhắc retry cho GET idempotent qua TanStack Query defaults.

## Low

- `share-button.tsx:35`: API fail vẫn `setCount(c=>c+1)` — fabricate số liệu.
- `socket.ts:8` parse env riêng thay vì import constants (DRY, và sẽ vỡ nếu C1 fix chỉ sửa constants).
- `middleware.ts:31` redirect không kèm `?next=` return path.
- `app-locations.conf:92-93` directives sau `return 204` là dead code.
- monitoring: prometheus chỉ scrape backend (prometheus.yml:16) — không có nginx/node exporter; alerts.yml chưa kiểm tra nội dung.

## Route protection matrix
PROTECTED (middleware.ts:5) = matcher (43-52) = 7 routes, khớp đủ saved/settings/create/dashboard/admin/notifications/feed. Không route nào sót; rủi ro còn lại là C2 (secret fallback) và M1 (admin role).

## Frontend+infra readiness: 5/10
Top 3 risks:
1. **Config build-time bake** (C1) — mọi deploy mới đều có nguy cơ lặp incident (b); fix relative `/api` là 1 buổi chiều, loại bỏ vĩnh viễn.
2. **Data-cache không kiểm soát + nuốt lỗi** (H1, M7) — stale-empty sẽ tái diễn dạng khác (stale post, stale category) và không ai biết vì lỗi bị nuốt.
3. **Secrets default + single-node không restore-drill** (C2, M3) — một env thiếu biến = auth bypass; một hostfail = mất cả data lẫn backup.

## Unresolved questions
1. Backend `/admin/*` endpoints có guard role server-side đầy đủ không (M1 parity)?
2. Backend upload size limit thực tế bằng bao nhiêu so với nginx 12m (M6)?
3. JWT payload có claim admin để middleware decode không?

Findings: Critical 2 · High 5 · Medium 7 · Low 5
