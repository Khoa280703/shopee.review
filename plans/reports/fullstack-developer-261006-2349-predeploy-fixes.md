# Pre-deploy fixes — xử lý toàn bộ finding trong code-reviewer-261006-2330-predeploy-review.md

Nguồn: `plans/reports/code-reviewer-261006-2330-predeploy-review.md` + `plans/261006-2207-audit-remediation/plan.md` + `docs/deployment-guide.md`. Build trên working tree Phase 1-4 có sẵn (không revert gì).

## Kết quả theo từng finding

### Critical

- **C1 — Dockerfile CMD phụ thuộc pnpm/corepack lúc runtime.** Sửa CMD gọi thẳng `packages/database/node_modules/.bin/prisma migrate deploy` thay vì `pnpm exec prisma`. Trong lúc rehearsal boot-test phát hiện thêm **2 bug ẩn khác** mà C1 cũ (EACCES) đã che mất hoàn toàn (container không bao giờ chạy tới bước sau):
  - `@sentry/nestjs` là dependency thật (không phải devDep) nhưng `pnpm prune --prod` vẫn xoá nó — package này khai `@nestjs/common`/`@nestjs/core` ở CẢ `peerDependencies` lẫn `devDependencies`, khiến pnpm coi cả node đó là dev-only khi prune. Fix: re-add y như cách đã làm với `prisma` (`pnpm add --filter @app/backend --save-prod --prod @sentry/nestjs@10.60.0` ngay sau prune).
  - `.prisma/client` (output thật của `prisma generate`, không phải chỉ `@prisma/client` package) không hề được build trong stage `prod-deps` (stage này rẽ nhánh từ `deps`, trước khi `builder` chạy generate) — nên không có trong image cuối. Fix: COPY `packages/database/prisma` vào `prod-deps` và chạy `prisma generate` lại ngay trong stage đó (tự chứa, không phụ thuộc đường dẫn hash pnpm xuyên stage).
  - Cũng sửa thứ tự COPY cuối: trước đây `COPY --from=builder /app/packages/database` (cả thư mục) đè lên node_modules đã prune — nay chỉ COPY `dist/`, `package.json`, `prisma/` từ builder, giữ `node_modules` từ `prod-deps`.
  - Pin `pnpm dlx playwright@1.60.0` (khớp version lockfile) thay vì `playwright@latest` (M6).
  - Boot-test thật trên server: container healthy, Chromium launch được dưới user `app` (non-root), version 148.0.7778.96 khớp pin.
- **C2 — Runbook role rotation sai.** Viết lại hoàn toàn mục "Postgres Role Rotation" trong `docs/deployment-guide.md`: bỏ cách `ALTER DATABASE OWNER` (đã verify KHÔNG chuyển ownership của table/sequence/MV/schema — xác nhận lại trên chính live DB: toàn bộ 15 bảng owner vẫn là `shopee_review`). Thay bằng: `pg_dump -Fc` (read-only) → `docker compose down` → xoá volume `pgdata` → `docker compose up -d db` (volume mới trống, init script tự tạo `shopee_review_app` làm owner) → `pg_restore --no-owner --no-acl -U shopee_review_app` → `docker compose up -d` (backend tự chạy `prisma migrate deploy` bằng app role). Đã rehearsal end-to-end thành công (xem bên dưới).
- **C3 — Live `.env` thiếu `POSTGRES_PASSWORD`.** Đưa thành bước 0 bắt buộc trong runbook mới (generate + ghi vào `.env` trước khi làm bất cứ gì khác). Xác nhận hành vi fail-fast (`:?...`) vẫn đúng (test bằng cách xoá `.env` ở dev clone → `docker compose config` báo lỗi rõ ràng, không silent fallback).
- **C4 — `openssl rand -base64` phá DATABASE_URL.** Đổi toàn bộ hướng dẫn generate `POSTGRES_PASSWORD` (docker-compose.yml x5 chỗ, `.env.example`, `docs/deployment-guide.md`) sang `openssl rand -hex 32`. `JWT_SECRET`/`ADMIN_TOKEN` giữ nguyên base64 vì không bao giờ nhúng vào URL, không có bug. Soát lại `postgres/init/01-app-role.sh`: password được nội suy không-quote-kỹ vào literal SQL qua heredoc không-quote — chỉ an toàn vì charset hex (`[0-9a-f]`) không có `'`/`\`/ký tự shell đặc biệt; đã thêm comment giải thích rõ invariant này (không đổi logic vì đã đúng).

### High

- **H1 — Open redirect qua `?next=`.** Tạo `apps/frontend/src/lib/safe-next.ts`: resolve `raw` qua `new URL(raw, origin)` thật rồi so `url.origin === origin`, cộng thêm chặn control-char/backslash trước khi parse (defense-in-depth). Thay thế logic `startsWith('/') && !startsWith('//')` cũ (bypass được bằng `/\evil.com`, `/\t/evil.com` — browser tự chuẩn hoá `\` thành `/` cho scheme đặc biệt) ở `login/page.tsx`, `register/page.tsx`, `callback/page.tsx`, `login-href.ts`. Test: `apps/frontend/src/lib/safe-next.test.ts` (8 case, bao gồm đúng 2 bypass nêu trong finding) — **pass trên server**.
- **H2 — nginx không trust real IP.** Thêm `set_real_ip_from 10.0.1.0/24` (mạng Coolify) + `172.16.0.0/12` (dải bridge Docker mặc định) + `127.0.0.1` + `fdc4:4f94:3b20::/64`, `real_ip_header X-Forwarded-For`, `real_ip_recursive on` vào `nginx/nginx.conf`. **Verify thật trên stack rehearsal**: gửi request với `X-Forwarded-For: 203.0.113.9` từ `127.0.0.1` (trusted) → access log nginx ghi đúng `203.0.113.9` thay vì `127.0.0.1` → xác nhận `limit_req` giờ key theo IP client thật.

### Medium

- **M1 — Race xoá/khôi phục comment.** `social.service.ts`: `softDeleteComment`/`restoreComment` đổi từ `update` vô điều kiện (trong `$transaction([...])` dạng mảng) sang `updateMany({ where: { id, deletedAt: null } })` (hoặc `not: null` cho restore) bên trong transaction tương tác, chỉ đụng counter khi `count === 1`. Đã verify: **posts không có race tương tự** (softDeletePost/restorePost không có counter, chỉ reindex search — idempotent) nên không cần sửa. Test mới: 2 case race (delete thua cuộc không giảm counter 2 lần; restore thua cuộc 404 thay vì tăng counter 2 lần).
- **M2 — Comment cha đã xoá ẩn luôn reply còn sống.** Thêm `TOP_LEVEL_COMMENT_VISIBLE_OR_PLACEHOLDER` (visible-content.ts): top-level comment đã xoá NHƯNG còn ít nhất 1 reply sống vẫn được trả về dưới dạng placeholder (`isDeleted: true`, `content: ''`, ẩn luôn `deletedById`/`deleteReason` — phát hiện đây là lần đầu tiên route đọc này show hàng đã xoá ra cho viewer thường, nên che nốt 2 field nội bộ cho chắc). `getReplies` bỏ check `parent.deletedAt` để "xem thêm reply" dưới placeholder vẫn hoạt động. Frontend: `Comment.isDeleted`, `comments-section.tsx` render text i18n (`comments.deletedPlaceholder`) thay content, ẩn nút reply/xoá cho placeholder; `comment-utils.ts` thêm `applyCommentDeletion` dùng chung cho cả REST optimistic update và socket `comment:deleted` (trước đây socket filter thẳng ra, mất luôn reply). **reconciliation.service.ts đã đúng sẵn** (đếm `WHERE deleted_at IS NULL`, không cần sửa). Test: 2 case backend (placeholder đúng where-clause + mapping, comment thường không bị đổi).
- **M3 — Notification bump sort theo id cũ.** `notifications.service.ts list()` đổi `orderBy: {id:'desc'}` → `orderBy: [{createdAt:'desc'},{id:'desc'}]` (cursor Prisma vẫn hoạt động — Prisma tự dựng so sánh compound từ record neo). Index schema+migration đổi từ `(recipient_id, id DESC)` sang `(recipient_id, created_at DESC, id DESC)`. Test: assert `orderBy` đúng mảng.
- **M4 — Không có confirm dialog / tab unban-unsuspend.** `admin/page.tsx`: `window.confirm()` trước suspend/ban/delete (dùng native vì không có component Dialog sẵn, admin-only internal tool — quyết định có chủ đích, không phải thiếu sót). Thêm tab "Tài khoản bị khoá" (`LockedTab`) gọi endpoint mới `GET /api/admin/users/locked` (paginated, `admin.service.listLockedUsers`) liệt kê user có `suspendedAt`/`bannedAt`, nút unsuspend/unban. Test backend cho endpoint mới.
- **M5 — OAuth callback lỗi trả JSON thô.** `auth.controller.ts`: bọc `googleLogin`/`facebookLogin` trong try/catch, map `ForbiddenException→account_locked`, `BadRequestException→oauth_unverified`, khác→`oauth_failed`, redirect `${FRONTEND_URL}/auth/login?error=...`. Login page đọc `?error=` và hiện message i18n (vi/en, 4 key: account_locked/oauth_unverified/oauth_state/oauth_failed — `oauth_state` vốn đã tồn tại ở backend nhưng frontend **chưa từng đọc** trước đây). Test: 4 case controller (3 mã lỗi + redirect thành công).
- **M6 — Playwright không pin version.** Đã gộp vào C1 ở trên (`playwright@1.60.0`, khớp `pnpm-lock.yaml`).

### Low (trong phạm vi được giao: L1, L2, L4, L5, L6)

- **L1 — Profile post count tính cả bài đã xoá mềm.** `users.service.ts`: `findByUsername` dùng `_count: {select: {posts: {where: {deletedAt: null}}}}` (Prisma filtered relation count); `getUserStats` thêm `deletedAt: null` vào `post.count`. Test 2 case.
- **L2 — Meili reindex gồm cả bài xoá/tác giả bị cấm.** `meilisearch.service.ts`: `indexPost` check `post.deletedAt || post.user.bannedAt` → `deleteDocument` thay vì `addDocuments`; `reindexAll` thêm `where: VISIBLE_POST_WHERE`. Verify thật trên rehearsal: log `"Reindexed 40 posts into Meilisearch"` chạy không lỗi (Prisma filter hợp lệ); không viết được unit test riêng cho MeilisearchService (constructor đọc `process.env.MEILI_HOST` để quyết định tạo client thật, cần mock phức tạp hơn fit với time-box của task) — **chấp nhận rủi ro này, note lại** thay vì giả lập test không có giá trị.
- **L4 — Partial index bỏ sót FK lookup.** Thêm lại `@@index([categoryId])` (Post) và `@@index([postId])` (Comment) trong `schema.prisma`, **không drop** 2 index plain gốc (`posts_category_id_idx`, `comments_post_id_idx`) trong migration mới nữa (trước đó migration drop rồi tạo lại index partial — nay giữ nguyên plain index gốc song song với partial index mới, tên khớp Prisma default nên `migrate diff` vẫn sạch).
- **L5 — statement_timeout toàn cục ảnh hưởng migration.** Thử nghiệm thực tế: đặt `options=-c statement_timeout=...` trên `DATABASE_URL` (qua pgbouncer) + `IGNORE_STARTUP_PARAMETERS=options` — **verify KHÔNG hoạt động** (pgbouncer transaction-pooling nhận connection nhưng âm thầm bỏ qua param, không forward vào session Postgres thật — `SHOW statement_timeout` qua pgbouncer vẫn trả giá trị global, kể cả khi client gửi `options=...`). Theo đúng fallback đã quyết định trước: bỏ cách per-connection, giữ **một giá trị global 60s** (`-c statement_timeout=60000`, tăng từ 30s cũ) trên service `db`, áp dụng cho mọi path (API/migration/backup). Đã viết lại comment trong compose + deployment-guide.md phản ánh đúng thực tế đã verify (không còn mô tả cách tiếp cận không hoạt động).
- **L6 — HSTS thiếu ở location có add_header riêng.** Tạo `nginx/snippets/security-headers.conf` (4 header dùng chung, gồm HSTS) và `include` nó ở server block + 2 location (`/api/`, `/_next/static/`) thay vì lặp lại subset 3 header thiếu HSTS. **Verify thật**: `wget -S` qua nginx container tới `/api/health` nay có `Strict-Transport-Security` (trước đây không có).

### Không thuộc phạm vi được giao (L3, L7, L8, L9) — không đụng tới, giữ nguyên trạng.

## Bằng chứng rehearsal (server clone `~/working-sources/shopee.review-dev`, project `shopeereview-dev`)

1. `rsync -a --delete --exclude node_modules --exclude .next --exclude dist --exclude .git --exclude .env` Mac → server.
2. `pnpm install` (thêm `vitest` cho frontend) → **lockfile đã đồng bộ lại về Mac** (xem mục riêng bên dưới) → `pnpm install --frozen-lockfile` pass.
3. `pnpm --filter @app/database build` (prisma generate + tsc) — OK.
4. `pnpm --filter @app/backend typecheck` — OK. `pnpm --filter @app/backend test` — **158/158 pass** (15 file, gồm 3 file test mới/sửa: `oauth-callback-errors.spec.ts` mới, `moderation-soft-delete.spec.ts` +2 describe +nhiều case, `moderation.spec.ts` +1 describe, `production-readiness.spec.ts` sửa mock transaction).
5. `pnpm --filter @app/frontend typecheck` — OK. `pnpm --filter @app/frontend test` — **8/8 pass** (`safe-next.test.ts`, vitest mới thêm cho frontend).
6. `pnpm --filter @app/backend build` / `pnpm --filter @app/frontend build` — production build **thành công cả hai** (Next 15.5.27, 20 route, static/dynamic đúng).
7. `docker compose -p shopeereview-dev config --quiet` — OK (cả `docker-compose.yml` và `docker-compose.monitoring.yml`).
8. `docker run ... nginx:1.27-alpine nginx -t` — **syntax OK** (cảnh báo `worker_connections` vs ulimit là known-issue đã ghi sẵn trong docs, compose đã set ulimit).
9. **Rehearsal role-rotation + restore đầy đủ** (dùng `docker-compose.override.yml` tạm `ports: !reset []` cho `db`/`nginx` để tránh đụng port loopback của stack live đang chạy cùng host — xoá sau khi xong):
   - `docker compose exec -T db pg_dump -U shopee_review -d shopee_review -Fc > backups/manual/rehearsal-*.dump` chạy trên **chính thư mục live** (read-only, xác nhận trước: mọi bảng live đang owner `shopee_review` — đúng như C2 mô tả).
   - Copy dump sang dev clone → `docker compose -p shopeereview-dev up -d db` (volume mới) → confirm `shopee_review_app`: `rolsuper=f`, là owner database.
   - `pg_restore --no-owner --no-acl -U shopee_review_app -d shopee_review < dump` — restore sạch, không lỗi.
   - `docker compose -p shopeereview-dev up -d --build` — build xong cả 2 image, **backend healthy sau 2 vòng sửa lỗi Dockerfile** (@sentry/nestjs, .prisma/client — xem C1).
   - `/api/health` qua `docker compose exec backend node -e "fetch(...)"`: `{"ok":true,"db":"up","redis":"up"}`.
   - `/api/posts?limit=3` trả đúng dữ liệu đã restore (post thật từ live, ví dụ id 115).
   - `SELECT relname, pg_get_userbyid(relowner) FROM pg_class WHERE ... owner <> 'shopee_review_app'` → **0 dòng** (mọi table/index/sequence/MV đều đã là `shopee_review_app`).
   - `docker compose exec db-backup /backup.sh` — dump bằng app role **thành công** (daily/weekly/monthly đều ghi được).
   - Qua nginx thật: `/` và `/api/health` trả đúng, header bảo mật đầy đủ kể cả HSTS trên `/api/`.
   - `whoami` trong container backend/frontend đều là `app` (non-root).
   - Chromium headless launch được trong container backend (Playwright, pin 1.60.0).
   - H2 real-IP test như mô tả ở trên.
10. **Dọn dẹp**: `docker compose -p shopeereview-dev down -v` (xoá container+volume+network), `docker rmi` 2 image build (`shopeereview-dev-backend/frontend`) + 3 image debug tạm, `docker builder prune -f`. Xác nhận `docker ps -a`/`volume ls`/`network ls`/`images` filter theo `shopeereview-dev` đều **rỗng**. Xoá `.env`, `docker-compose.override.yml`, `backups/manual/*.dump` tạm trên dev clone. Không đụng tới container/volume/.env của stack **live** (`shopeereview`) — chỉ đọc (`pg_dump`, `\dt`, `docker compose ps`).

## pnpm-lock.yaml — lưu ý quan trọng

Thêm `vitest` vào `apps/frontend/package.json` cần cập nhật lockfile. Vì không được chạy pnpm trên Mac, tôi chạy `pnpm install` trên server (được phép), rồi **copy ngược nội dung `pnpm-lock.yaml` từ server về Mac** (qua `ssh ... cat` + ghi file, không chạy pnpm cục bộ). Xác nhận cuối: `pnpm install --frozen-lockfile` trên server với lockfile đã đồng bộ **pass sạch** — Mac và server hiện khớp 100%.

## Lệnh rollout chính xác cho LIVE (đã verify qua rehearsal ở trên, CHƯA chạy vào live)

```bash
cd ~/working-sources/shopee.review   # thư mục live

# 0. Nếu .env chưa có POSTGRES_PASSWORD (đúng tình trạng hiện tại — C3):
openssl rand -hex 32   # dán vào .env POSTGRES_PASSWORD

# 1. Backup read-only (không đổi gì trên live).
mkdir -p backups/manual
docker compose exec -T db pg_dump -U shopee_review -d shopee_review -Fc \
  > backups/manual/pre-role-rotation-$(date +%Y%m%d-%H%M%S).dump

# 2. Dừng stack (cửa sổ downtime duy nhất).
docker compose down

# 3. Xoá volume Postgres cũ (giữ nguyên redis/meili — seed data, backend tự rebuild).
docker volume rm shopeereview_pgdata

# 4. Lên lại chỉ `db` trên volume trống — init script tự chạy, tạo shopee_review_app.
docker compose up -d db
docker compose exec -T db pg_isready -U shopee_review

# 5. Restore BẰNG app role (không phải superuser) — ownership đúng ngay từ lúc tạo.
docker compose exec -T db pg_restore --no-owner --no-acl \
  -U shopee_review_app -d shopee_review \
  < backups/manual/pre-role-rotation-<timestamp>.dump

# 6. Lên toàn bộ stack — backend tự chạy `prisma migrate deploy` bằng app role.
docker compose up -d

# 7. Verify (xem docs/deployment-guide.md mục "Postgres Role Rotation" — 3 câu lệnh
#    kiểm tra rolsuper=f, 0 relation lạc chủ, db-backup dump được).
```

**Lưu ý vận hành khi áp dụng thật vào live** (khác rehearsal): bước 3 xoá **đúng tên volume** của project live (`shopeereview_pgdata`, không phải `shopeereview-dev_pgdata`) — xác nhận lại bằng `docker volume ls | grep pgdata` trước khi xoá. Live hiện còn chạy container `certbot` cũ (image cũ, trước phase 4) — compose file mới không còn service này; lần `docker compose up -d` ở bước 6 sẽ không tạo lại nó nhưng cũng không tự xoá container cũ orphan — cần `docker compose up -d --remove-orphans` (L9, đã biết, không thuộc phạm vi task này nhưng nên làm cùng lúc deploy thật để tránh container certbot vô chủ chạy mãi).

## Files đã sửa/tạo (chính)

- Infra: `apps/backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `docs/deployment-guide.md`, `postgres/init/01-app-role.sh`, `nginx/nginx.conf`, `nginx/conf.d/app.conf`, `nginx/snippets/app-locations.conf`, `nginx/snippets/security-headers.conf` (mới).
- H1: `apps/frontend/src/lib/safe-next.ts` (mới), `safe-next.test.ts` (mới), `login-href.ts`, `auth/login/page.tsx`, `auth/register/page.tsx`, `auth/callback/page.tsx`, `vitest.config.ts` (mới), `apps/frontend/package.json`.
- M1/M2: `apps/backend/src/social/social.service.ts`, `apps/backend/src/common/visible-content.ts`, `apps/frontend/src/types/index.ts`, `apps/frontend/src/components/social/{comments-section.tsx,comment-utils.ts,use-comment-socket.ts}`, `messages/{en,vi}.json`.
- M3: `apps/backend/src/notifications/notifications.service.ts`, `packages/database/prisma/schema.prisma`, migration `20261006230000_moderation_levels_soft_delete_and_indexes/migration.sql`.
- M4: `apps/backend/src/moderation/{admin.controller.ts,admin.service.ts}`, `apps/frontend/src/app/admin/page.tsx`, `apps/frontend/src/lib/api.ts`, `messages/{en,vi}.json`.
- M5: `apps/backend/src/auth/auth.controller.ts`, `apps/frontend/src/app/auth/login/page.tsx`, `messages/{en,vi}.json`.
- L1: `apps/backend/src/users/users.service.ts`.
- L2: `apps/backend/src/search/meilisearch.service.ts`.
- Tests mới/sửa: `apps/backend/test/{moderation-soft-delete.spec.ts, moderation.spec.ts, production-readiness.spec.ts, oauth-callback-errors.spec.ts}`, `apps/frontend/src/lib/safe-next.test.ts`.
- `pnpm-lock.yaml` (vitest cho frontend).

## Câu hỏi/rủi ro còn mở

- **L2 chưa có unit test riêng** cho `MeilisearchService` (chỉ verify gián tiếp qua rehearsal chạy thật `reindexAll()` không lỗi + dùng lại `VISIBLE_POST_WHERE` đã test ở nơi khác). Nếu cần test riêng, phải mock `Meilisearch` client class — có thể làm thêm nếu được yêu cầu.
- **L9 (orphan certbot)** không thuộc phạm vi task nhưng sẽ chặn đường nếu không thêm `--remove-orphans` lúc deploy live thật — đã note trong phần rollout ở trên.
- Chưa deploy vào live (đúng yêu cầu — chỉ rehearsal). Cần user duyệt trước khi chạy chuỗi lệnh ở mục "Lệnh rollout" vào `~/working-sources/shopee.review`.

Status: DONE
Summary: Đã sửa toàn bộ C1-C4/H1-H2/M1-M6/L1,L2,L4,L5,L6 trong finding, rehearsal end-to-end (dump→restore role mới→boot backend/frontend→verify qua nginx) thành công trên server clone, phát hiện và vá thêm 2 bug Docker ẩn (@sentry/nestjs bị prune, .prisma/client không được build vào image) mà review gốc chưa thấy do bị C1 che; typecheck/test/build sạch cả hai app, đã dọn sạch container/volume/image rehearsal.
