# Audit hạ tầng/vận hành — shopee.review (read-only)

Ngày: 2026-10-06. Phạm vi: docker-compose/Dockerfile/nginx/CI/env/leftovers/dev-workflow trên local repo (HEAD 983a01e) đối chiếu với server `homelab:~/working-sources/shopee.review` (cùng HEAD, deploy ~20:55 hôm nay). Method: đọc source local + SSH read-only vào server (docker compose ps/logs/stats, docker system df, curl timing, psql check). Không sửa file, không restart container nào.

## Tóm tắt điều hành

Stack production đang chạy khỏe (8/8 service healthy, latency 3-40ms, 0 lỗi trong 500 dòng log gần nhất của backend/frontend). Phần lớn P0/P1 của audit 2026-07-16 đã được fix thật sự trong code (xem bảng cross-check). Vấn đề còn lại nằm ở 3 nhóm: **(1) Traefik/Let's Encrypt đang loop lỗi ACME liên tục mỗi ~15-60s vì `DOMAIN` server set thành `localhost`** — nghĩa là domain/TLS công khai trong docs chưa bao giờ hoạt động thật, truy cập thực tế chỉ qua Tailscale/SSH tunnel vào loopback; **(2) disk 87% đầy chủ yếu do image/build-cache của các project KHÁC trên cùng host** (42GB image, 94% reclaimable; 9.5GB build cache, 7.9GB reclaimable) — host này không phải VPS riêng cho shopee.review mà là homelab dùng chung với ~5 project khác (Coolify, downloadtool, homelab-api, landing...); **(3) monitoring (Prometheus/Grafana/Loki) được khai báo trong `monitoring/docker-compose.monitoring.yml` nhưng KHÔNG có container nào đang chạy** — toàn bộ claim "Monitoring: Prometheus, Grafana, Loki, Sentry" trong README chỉ đúng phần Sentry (no-op nếu không set DSN, chưa verify DSN có set) và code đã wire sẵn (`/metrics`, alerts.yml...) nhưng chưa từng `docker compose -f monitoring/... up -d`.

---

## 1. docker-compose.yml, Dockerfile, .dockerignore

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Multi-stage build | Có (`deps`→`builder`→`runner`) cho cả 2 Dockerfile | `apps/backend/Dockerfile:1-33`, `apps/frontend/Dockerfile:1-34` |
| Non-root user | **Không** — không `USER` nào được set, cả 3 container (backend/frontend/nginx) chạy `root` | `docker inspect ... --format "{{.Config.User}}"` → rỗng cho cả 3 |
| Healthcheck | Có đầy đủ cho db/redis/pgbouncer/backend/frontend/meilisearch, dùng `node -e fetch(...)` không cần curl/wget thêm vào image | `docker-compose.yml:159-164,186-191,253-257` |
| Resource limits | **Không** — chỉ `meilisearch` có `mem_limit: 512m` (`docker-compose.yml:252`); db/redis/backend/frontend/nginx/pgbouncer không giới hạn mem/cpu | `docker inspect ... Memory=0 CPUs=0` cho cả 6 service |
| Restart policy | `unless-stopped` nhất quán cho mọi service | grep toàn bộ compose |
| Log rotation | **Đã có ở tầng Docker daemon** (`max-size: 10m, max-file: 3`, json-file) — khác với audit cũ nghi ngờ thiếu | `/etc/docker/daemon.json` trên server + `docker inspect ... LogConfig` khớp |
| Secrets | `${JWT_SECRET:?...}`, `${ADMIN_TOKEN:?...}` bắt buộc (fail-fast nếu thiếu) — đã fix so với audit cũ (từng có default `change-me-admin-token`) | `docker-compose.yml:122,125` |
| Volumes | named volumes cho pgdata/redis-data/meili-data/nginx-cache — ổn | `docker-compose.yml:260-264` |
| Image size | `shopeereview-backend` **2.71GB** (so với `shopeereview-frontend` 472MB). Nguyên nhân: (a) `pnpm dlx playwright install chromium --with-deps` ở runner stage (`Dockerfile:20`), (b) **không có bước `pnpm prune --prod`** trước khi copy `node_modules` từ builder → devDependencies vẫn nằm trong image production | `apps/backend/Dockerfile:20-29`; `docker images` trên server |
| .dockerignore | Local repo: fix `**/node_modules` **chưa commit** — `git status` server show `modified: .dockerignore` (uncommitted), đúng như đề bài đã biết, không báo lại là mới | `git diff .dockerignore` trên server (đã list ở trên) |

**Đánh giá nghiêm trọng (Medium→High do host dùng chung):** host này chạy ~10 project khác nhau (Coolify, downloadtool-douyin-signer 3.34GB, homelab-api, o8kccgkgwsockoocow8sg88s_frontend 2.38GB...) trên **cùng 1 máy vật lý** (110GB RAM, nhưng CPU/disk share). Không có resource limit cho shopee.review services nghĩa là một leak (vd Playwright/scraper chromium zombie) có thể ăn hết RAM/CPU của toàn bộ host, ảnh hưởng các project khác — rủi ro cao hơn một VPS riêng.

**Fix đề xuất:**
- Thêm `mem_limit`/`cpus` cho backend (nhất là vì chạy Playwright), frontend, db, redis.
- Thêm `user: "1000:1000"` (hoặc tạo non-root user trong Dockerfile) cho backend/frontend/nginx.
- Thêm `RUN pnpm prune --prod` (hoặc deploy build riêng không cài devDependencies) trước stage runner để giảm size 2.71GB.
- Commit `.dockerignore` fix (`**/node_modules` etc.) — hiện chỉ tồn tại uncommitted trên server, build ở máy khác (CI, Mac) sẽ không có fix này.

---

## 2. nginx/

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Rate-limit | 4 zone đúng như docs: api 10r/s, auth 5r/m, upload 2r/s, ws 100r/s | `nginx/nginx.conf:39-43` |
| Gzip | Bật, verify thật qua curl: `Content-Encoding: gzip` trên `/` | curl `-H "Accept-Encoding: gzip"` → có header |
| Brotli | Không có (đúng như docs ghi "cần custom image") | — |
| Cache static/_next | `expires 1y` + `Cache-Control: public, immutable` + proxy_cache 60m | `nginx/snippets/app-locations.conf:105-114` |
| SSE buffering | `proxy_buffering off` đúng vị trí, `proxy_read_timeout 1h` | `app-locations.conf:28-38` |
| Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) | Có, và **đã fix bug cũ** (audit 07-16 L1: "add_header không kế thừa trên /api & /_next/static") — nay re-assert headers trong cả 2 location đó | `app-locations.conf:73-77,111-113`; verify curl `/` thấy đủ 3 header |
| **CSP (Content-Security-Policy)** | **Không có ở bất kỳ đâu** — không trong `app.conf`, không trong `app-tls.conf.disabled`, không trong snippet | grep toàn bộ `nginx/` |
| **HSTS** | Không có trong `app.conf` (đúng vì đang chạy plain HTTP — HSTS chỉ nằm trong `app-tls.conf.disabled:52`, chưa kích hoạt) | — |
| client_max_body_size | `12m` global + lặp lại ở `/api/uploads/` — khớp docs | `nginx.conf:25`, `app-locations.conf:58` |
| proxy timeout | SSE 1h, WS 86400s, còn lại dùng default — hợp lý cho use-case | `app-locations.conf:20-21,36` |
| resolver (stale upstream DNS) | **Đã fix** — `resolver 127.0.0.11 valid=10s` + `$backend_host`/`$frontend_host` variable proxy_pass (audit cũ INFRA-H2) | `nginx.conf:76`, `app-locations.conf:11-12` |
| **worker_connections vs ulimit** | **Finding mới** — `worker_connections 4096` nhưng container chỉ có soft nofile limit **1024** → nginx tự in warning lúc start, dưới tải cao sẽ hit "too many open files" sớm hơn dự kiến | log thật: `nginx-1 | 2026/10/06 13:58:01 [warn] 1#1: 4096 worker_connections exceed open file resource limit: 1024`; xác nhận bằng `docker compose exec nginx sh -c "ulimit -n -S; ulimit -n -H"` → `1024` / `524288` |
| `/metrics` loopback-only | Hoạt động đúng thiết kế — test curl từ host `127.0.0.1:8081/metrics` → `403` (vì qua docker-proxy, nginx thấy remote_addr là gateway IP chứ không phải 127.0.0.1 thật; Prometheus thật sự nên scrape `backend:3066` trực tiếp qua compose network như comment ghi) | curl test → `HTTP:403` |

**Fix đề xuất:**
- Thêm `ulimits: nofile: {soft: 65536, hard: 65536}` cho service `nginx` trong compose, hoặc hạ `worker_connections` xuống ≤1024.
- Cân nhắc thêm CSP tối thiểu (vd `default-src 'self'; img-src 'self' data: https://pub-*.r2.dev https://picsum.photos ...`) — hiện là defense-in-depth gap duy nhất còn thiếu trong nhóm security header.

---

## 3. Certbot / Traefik / Coolify / Monitoring — doc vs thực tế

**Phát hiện nghiêm trọng nhất của audit này:**

Traefik (chạy qua Coolify, container `coolify-proxy`) có router thật `shopeereview-https@docker` với rule `Host(\`localhost\`)` và **đang loop lỗi ACME mỗi 15-60 giây, liên tục**, vì compose label dùng `Host(\`${DOMAIN:-localhost}\`)` (`docker-compose.yml:218,221`) và server `.env` set `DOMAIN=localhost` (không phải `shopee.review` như docs mô tả):

```
coolify-proxy logs: [ERR] Unable to obtain ACME certificate for domains
error="... Cannot issue for \"localhost\": Domain name needs at least one dot"
... routerName=shopeereview-https@docker rule=Host(`localhost`)
```
(lặp lại hàng trăm lần/giờ — xác nhận bằng docker ps container `shopeereview-nginx-1` nằm trong network `coolify` cùng `coolify-proxy`).

→ **Kết luận: domain công khai `shopee.review` + Let's Encrypt qua Traefik trong README/deployment-guide chưa bao giờ hoạt động trên server này.** Xác nhận thêm: `nginx/certbot/conf/` trên server chỉ có `renewal-hooks` (thư mục rỗng, không cert nào), `app-tls.conf.disabled` vẫn disabled (local + server giống nhau). Truy cập thực tế là qua Tailscale/SSH tunnel vào `127.0.0.1:8081` (plain HTTP nội bộ) — khớp với context đề bài, nhưng **docs không hề nhắc tới việc domain/TLS chưa active**, gây hiểu lầm nếu ai đọc README nghĩ rằng site đã public qua HTTPS.

Rủi ro phụ: loop lỗi ACME liên tục với cùng 1 "domain" (localhost) nhiều tháng có thể làm Traefik/Coolify tốn CPU lặp vô ích (không đáng kể hiện tại — `coolify-proxy` CPU 1.14%) nhưng về nguyên tắc nên dọn vì gây log noise và nhầm lẫn khi debug Coolify sau này cho các site khác trên cùng Traefik.

**Monitoring (Prometheus/Grafana/Loki):**

```
docker ps -a | grep -iE "prometheus|loki|grafana|promtail"  → KHÔNG MATCH GÌ (0 dòng)
```

Không container nào của `monitoring/docker-compose.monitoring.yml` từng chạy (không có cả container đã exited). README liệt kê "Monitoring: Prometheus, Grafana, Loki, Sentry" như một stack đã-wired, và code thực sự có (`/metrics` endpoint hoạt động — verified `curl /metrics` → 403 đúng vì bị chặn, nghĩa là endpoint tồn tại; `monitoring/prometheus/alerts.yml`, Grafana dashboard JSON tồn tại) nhưng **chưa từng được `docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d`**. Đây là gap vận hành thật: hiện tại không có cách nào biết backend bị degraded/slow ngoài xem log thủ công.

**Fix đề xuất:**
1. Set `DOMAIN=shopee.review` (hoặc domain thật) trong server `.env`, hoặc nếu domain thật sự chưa trỏ DNS về host này thì **tắt hẳn router HTTPS Traefik** (xoá/comment label `traefik.http.routers.shopeereview-https.*`) để ngừng loop lỗi ACME vô nghĩa, cho tới khi DNS sẵn sàng.
2. Quyết định rõ: nếu chỉ dùng nội bộ qua Tailscale thì xoá hẳn phần Traefik/certbot khỏi compose (giảm 2 container không dùng: `certbot` + Traefik router) hoặc giữ tài liệu rõ "đây là tùy chọn, hiện chưa bật".
3. Nếu muốn observability thật: `docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d` (đã có `GRAFANA_PASSWORD` required trong server .env — cần confirm key tồn tại, **có**, xem mục 6).

---

## 4. Live runtime health

```
docker compose ps  → 8/8 service "Up ... (healthy)" (backend/frontend/db/redis/pgbouncer/meilisearch/db-backup healthy; nginx không có healthcheck định nghĩa nhưng Up bình thường), certbot Up 29h (loop riêng, không healthcheck)
```

- `docker stats --no-stream`: CPU tất cả service của shopee.review ≤0.3%, RAM: backend 143MB, frontend 77MB, db 32MB, redis 4.3MB, pgbouncer 1.7MB, nginx 65MB, meilisearch 46MB/512MB limit (9%) — rất nhẹ, không có dấu hiệu leak tại thời điểm audit (mới redeploy 18 phút trước nên chưa phản ánh steady-state dài hạn).
- Backend/frontend log 500 dòng gần nhất: **0 match error/warn/exception/fail** — sạch.
- nginx log 500 dòng: chỉ có 1 warning (worker_connections/ulimit, mục 2), không 4xx/5xx nào khác.
- Redis: `maxmemory_policy:noeviction`, `used_memory_human:1.72M`/512M, 7 key (mới restart nên cache lạnh, không phản ánh được pattern dùng Redis dài hạn).
- Meilisearch: `/health` → `{"status":"available"}` (phải gọi qua `docker compose exec` hoặc trong network — **port không publish ra host** nên checklist "`curl http://localhost:7700/health`" trong deployment-guide **chỉ chạy được từ trong container/network**, không chạy trực tiếp từ host nếu không có `docker compose exec` — gây hiểu lầm nhỏ khi làm theo guide). Health check log lặp mỗi 10s do Docker healthcheck polling, bình thường.
- Latency đo tại server qua `127.0.0.1:8081`:

| Endpoint | HTTP | total | ttfb |
|---|---|---|---|
| `/` | 200 | 23.8ms | 19.2ms |
| `/api/health` | 200 | 3.6ms | 3.6ms |
| `/api/posts?limit=10` | 200 | 10.3ms | 10.2ms |
| `/@test/115` (post page thật) | 200 | 40.7ms | 34.5ms |
| `/metrics` | 403 (đúng thiết kế, xem mục 2) | 0.4ms | — |

`/api/health` body: `{"ok":true,"service":"shopee-review-api","db":"up","redis":"up","degraded":false}` — healthy thật, không chỉ container healthcheck giả.

**Kết luận mục 4: hệ thống đang chạy tốt, không có incident tại thời điểm audit.**

---

## 5. CI/CD (.github/workflows/ci.yml)

| Job | Có chạy | Ghi chú |
|---|---|---|
| typecheck (backend+frontend) | ✅ | `ci.yml:28-29` |
| unit test | ✅ backend only (`pnpm --filter @app/backend test`) | `ci.yml:30` — **frontend không có test nào để chạy** (xác nhận lại claim audit cũ "0 frontend test") |
| build | ✅ full `pnpm build` | `ci.yml:31` |
| frontend-image-guard | ✅ guard chặn regression bake absolute API URL vào bundle | `ci.yml:36-56` |
| integration-db + drift-check | ✅ Postgres service, migrate deploy, `prisma migrate diff --exit-code` | `ci.yml:60-92` |
| **lint** | **❌ KHÔNG chạy trong CI** dù `package.json` có `"lint": "turbo run lint"` và cả backend (`tsc --noEmit`) lẫn frontend (`next lint`) đều có script lint riêng | grep `ci.yml` không có bước nào gọi `pnpm lint`/`turbo run lint` |
| e2e | ❌ Không có, đúng như audit cũ | — |
| build+push Docker image lên registry | ❌ Không có — `frontend-image-guard` chỉ build tạm để kiểm tra bundle, không push, không tag | `ci.yml:36-56` |
| Deploy | ❌ Thủ công hoàn toàn — không `.github/workflows/*deploy*`, không bước SSH/docker-compose nào trong CI | `find .github -iname "*deploy*"` → rỗng |

**Fix đề xuất:** thêm step `pnpm lint` vào job `build-and-unit` (rẻ, không cần thay đổi job khác); cân nhắc thêm smoke e2e tối thiểu (login→post→react) như audit cũ đã đề xuất — vẫn còn mở.

---

## 6. Env: .env.example vs server .env (chỉ so key, không in giá trị)

Server có key, `.env.example` + local `.env` **không có**:
- `PUBLIC_API_URL` — **xác nhận: không được code nào tham chiếu** (`grep -rn "PUBLIC_API_URL" apps packages docker-compose.yml .github` → 0 match). Rác từ setup cũ trước khi chuyển sang relative `/api` base, vô hại nhưng nên xoá khỏi server `.env`.
- (local `.env` + `.env.example` đều có `NEXT_PUBLIC_API_URL`, server cũng có — biến này **cũng đã dead code** theo đúng comment trong `apps/frontend/src/lib/constants.ts:3` và `docker-compose.yml:170`: "No NEXT_PUBLIC_API_URL: the browser uses a relative /api base". Nên dọn ở cả 3 nơi, không chỉ server.)

Local `.env` + `.env.example` có key, **server .env không có**:
- `ADMIN_BOOTSTRAP_USERNAME` — nếu đây là lần đầu seed admin thì thiếu biến này nghĩa là backend boot sẽ không tự cấp `is_admin` cho ai (không có self-promotion UI theo design) — **cần hỏi**: đã có admin tồn tại từ trước (migrate giữ data) hay cần set lại?
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` / `FACEBOOK_CALLBACK_URL` — optional feature, compose có default rỗng (`${FACEBOOK_CLIENT_ID:-}`), không lỗi, chỉ là nút Facebook login sẽ ẩn trên prod (nhất quán, không phải bug).

`GRAFANA_PASSWORD` **có mặt** trong server `.env` — vậy nếu muốn bật monitoring stack (mục 3) thì không bị chặn bởi thiếu secret.

---

## 7. Leftover trên server

| Hạng mục | Kết quả |
|---|---|
| Disk tổng | `87%` used (1.6T/1.9T) — khớp claim đề bài |
| `docker system df` | Images: 37 total, 32 active, **42.59GB, 94% reclaimable (40.39GB)**; Containers: 6.07GB; Volumes: 46 total/33 dangling, 6.19GB (33% reclaimable, 2.07GB); **Build cache: 9.54GB, 7.86GB reclaimable (82%)** |
| Dangling images | `docker images -f dangling=true` → **0** (not the issue — vấn đề là nhiều tag/digest cũ của các project KHÁC còn giữ container tham chiếu, ví dụ `jg04gcwk0s4ogokggc80wogk_*` có 2 version song song, `o8kccgkgwsockoocow8sg88s_*` 3 tháng tuổi 2.38GB+1.46GB+622MB vẫn "active") |
| Dangling volumes | 13/46 — có thể prune an toàn (read-only audit nên **không chạy** `docker volume prune`) |
| Host `node_modules` (shopee.review) | `1.1G` ở root workspace — **không cần thiết cho runtime** (app chạy hoàn toàn trong Docker image build riêng), chỉ cần nếu chạy `pnpm` trực tiếp trên host (vd migrate thủ công). Không phải "rác" nghiêm trọng nhưng có thể xoá nếu không dùng host-side pnpm. |
| `backups/` | **352K, 8 file (~17KB/file), daily hoạt động đúng lịch** (29/09 → 06/10 liên tục, symlink `-latest` đúng) — xác nhận DB nhỏ (dữ liệu demo), backup pipeline hoạt động thật, không phải rác |
| Lưu ý quan trọng | **42GB image + 9.5GB build cache chủ yếu KHÔNG thuộc shopee.review** — host này là máy homelab dùng chung (Coolify, `downloadtool-douyin-signer` 3.34GB, `homelab-api`/`homelab-migrate` ~1.7GB, `o8kccgkgwsockoocow8sg88s_*` project khác ~4.4GB, `gpu-burn` 4.09GB, `oguzpastirmaci` test image...). shopee.review tự thân chỉ chiếm ~3.2GB (backend 2.71GB + frontend 472MB image hiện tại; build cache riêng của nó không tách được từ tổng 9.5GB nhưng chắc chắn không phải nguyên nhân chính của 87% disk). |

**Fix đề xuất (cần xác nhận ai sở hữu các project kia trước khi dọn — ngoài phạm vi sửa của repo này):** `docker image prune -a --filter "until=720h"` sau khi xác nhận image nào không còn dùng; `docker builder prune` để giải phóng 7.86GB build cache; `docker volume prune` cho 13 dangling volume. Đây là việc dọn dẹp **toàn host**, không riêng shopee.review — nên bàn với người quản lý các project khác trước khi prune vì có thể ảnh hưởng rollback của họ.

---

## 8. Developer workflow: dev từ Mac trong khi debug trên server

- Không có `docker-compose.dev.yml`/override nào cho hot-reload trên server — chỉ có 1 `docker-compose.yml` build production multi-stage (không mount source, không `nodemon`/`next dev`).
- README chỉ mô tả dev **local trên máy dev** (`pnpm --filter @app/backend dev` port 3066, frontend 5166) — **không có tài liệu nào** cho workflow "server là nguồn sự thật, debug từ Mac qua Tailscale".
- Ports thực tế publish ra host trên server: chỉ `127.0.0.1:8081` (nginx) và `127.0.0.1:65432` (Postgres). Backend (3066) và frontend (3000) chỉ `expose` nội bộ compose network, **không bind ra host** — nghĩa là về lý thuyết có thể chạy `pnpm --filter @app/backend dev` trực tiếp trên host server (ngoài Docker) bind cổng 3066 mà không đụng container đang chạy (vì container không chiếm cổng host), trỏ `DATABASE_URL` vào `127.0.0.1:65432` sẵn có — nhưng **điều này không được ghi ở đâu**, dev phải tự suy ra.
- Thiếu: (a) tài liệu rõ ràng cho SSH tunnel pattern (`ssh -L 3066:127.0.0.1:3066 homelab` tương tự cách monitoring compose đã làm mẫu ở dòng đầu file `monitoring/docker-compose.monitoring.yml:3-5`), (b) compose override mount source + hot reload nếu muốn dev ngay trên server bằng Docker thay vì host-side pnpm, (c) cảnh báo rằng sửa code trực tiếp trên server rồi quên commit sẽ lệch với repo Mac (hiện đã có 1 ví dụ thực tế: `.dockerignore` sửa trên server nhưng chưa commit).

**Fix đề xuất:** thêm 1 mục ngắn trong `docs/deployment-guide.md` mô tả 2 lựa chọn remote-dev (host-side `pnpm dev` + SSH tunnel cổng 3066/3000, hoặc tạo `docker-compose.dev.yml` với bind-mount + `next dev`/`--watch`), và nhắc nhở commit mọi thay đổi sửa trực tiếp trên server.

---

## Cross-check với `plans/reports/production-readiness-audit-260716-1558-full-stack-report.md`

| ID | Trạng thái | Bằng chứng |
|---|---|---|
| INFRA-C1 (DB public + password hardcode) | **FIXED (bind)**, password vẫn dùng fallback `${POSTGRES_PASSWORD:-shopee_review_dev}` không bắt buộc (`:?`) như JWT_SECRET/ADMIN_TOKEN | `docker-compose.yml:7,12` — port đã `127.0.0.1:65432`; password vẫn optional-fallback, nên nếu server `.env` không set `POSTGRES_PASSWORD` thì vẫn dùng password mặc định yếu (chỉ không exposed public nữa nên rủi ro giảm nhiều, không còn Critical) |
| INFRA-C2 (monitoring public, no auth) | **FIXED trong code** (bind `127.0.0.1`, `GRAFANA_PASSWORD:?` bắt buộc) — nhưng **stack chưa từng chạy** (xem mục 3) nên vấn đề "chưa được bật" thay vì "bị lộ" | `monitoring/docker-compose.monitoring.yml:19,31,48,54`; `docker ps` không có container |
| DATA-C1 (connection_limit=1) | **FIXED** — nay `connection_limit=15` | `docker-compose.yml:117` |
| INFRA-H1 (no graceful shutdown, sh PID 1) | **FIXED** — `main.ts:75 app.enableShutdownHooks()` có; Dockerfile CMD dùng `exec node` cuối chuỗi `sh -c` | `apps/backend/src/main.ts:75`; `Dockerfile:33` |
| INFRA-H2 (nginx stale upstream DNS) | **FIXED** — `resolver` + variable proxy_pass | `nginx.conf:76`, `app-locations.conf:11-12` |
| INFRA-H3 (ADMIN_TOKEN default yếu) | **FIXED** — `${ADMIN_TOKEN:?...}` bắt buộc | `docker-compose.yml:125` |
| INFRA-H4 (/metrics allow-list bypass qua Traefik 172.16/10) | **FIXED** — chỉ còn `allow 127.0.0.1; deny all;` | `app-locations.conf:98-102` |
| INFRA-H5 (nginx 8081 public + COOKIE_SECURE default false) | **FIXED (bind)** — `127.0.0.1:8081:80`; COOKIE_SECURE default vẫn false nhưng README nói auto-detect qua X-Forwarded-Proto — **chưa verify runtime vì chưa có HTTPS thật** (xem mục 3), nên cờ Secure-cookie-tự-động chưa từng được kiểm chứng trên traffic thật | `docker-compose.yml:203` |
| DATA-H2 (FeedService không degrade khi Redis lỗi) | **FIXED** — try/catch quanh `cache.get`/`cache.set` | `apps/backend/src/feed/feed.service.ts:26-39` |
| FE-H1/H2/H3, FE-M* | Không thuộc phạm vi audit infra lần này — các commit gần đây (`26bacad` toast/notification, `01d2d09` toast system + a11y) gợi ý đã có sửa frontend, nhưng **cần code-reviewer audit lại riêng**, không verify trong lượt này |
| M1 (migrate-on-start, `depends_on: service_started`) | **Không áp dụng nữa** — compose hiện dùng `condition: service_healthy` cho mọi dependency (db/pgbouncer/redis/meilisearch) | `docker-compose.yml:148-156` |
| M2 (backup same-disk, no offsite/PITR) | **STILL OPEN** — xác nhận `./backups` nằm cùng disk `/dev/nvme0n1p2` với mọi thứ khác, không thấy rclone/S3 sync nào | `docker-compose.yml:94-95` volume mount `./backups:/backups`; không tìm thấy cron offsite |
| M3 (no resource limits / log rotation / PG tuning) | **log rotation: FIXED** (daemon.json, mục 1); **resource limits: STILL OPEN** (mục 1); PG tuning: không kiểm tra sâu trong lượt này |
| M4 (containers run root) | **STILL OPEN** — xác nhận `User:` rỗng cho backend/frontend/nginx | `docker inspect` |
| M5 (CI no lint/FE-test/e2e/backend-image-build) | **STILL OPEN**, xác nhận chi tiết ở mục 5 | `ci.yml` |
| M6 (dual TLS story Traefik+certbot) | **STILL OPEN và tệ hơn dự kiến** — không chỉ "dual story" mà Traefik đang **loop lỗi thật** vì DOMAIN=localhost (mục 3) |
| L1 (nginx add_header inheritance drop ở /api, /_next/static) | **FIXED** — đã re-assert (mục 2) |
| L2 (docs claim sai: ".env in VCS", migration/Traefik description) | Docs hiện tại (`deployment-guide.md`) đã sửa câu ".env ... **DO NOT commit secrets**" hợp lý hơn, nhưng **mô tả Traefik/Let's Encrypt vẫn sai thực tế** (domain chưa active) — một dạng mới của L2, xem mục 3 |

---

## Câu hỏi chưa giải quyết

1. `DOMAIN=localhost` trên server — là tạm thời (chưa trỏ DNS) hay quên set? Có nên tắt hẳn router HTTPS Traefik cho tới khi domain sẵn sàng, để ngừng loop lỗi ACME?
2. Có ý định bật `monitoring/docker-compose.monitoring.yml` trên server này không, hay giữ nguyên trạng (chỉ xem log thủ công qua `docker compose logs`)?
3. `ADMIN_BOOTSTRAP_USERNAME` thiếu trong server `.env` — đã có admin tồn tại từ trước (giữ qua các lần deploy) hay cần set lại để bootstrap?
4. 40GB+ image/build-cache cần dọn là dùng chung với các project khác trên host — ai là người có quyền quyết định prune (ngoài phạm vi riêng shopee.review)?
5. `POSTGRES_PASSWORD` trên server có thật sự được set khác default `shopee_review_dev` không? (không thể verify mà không in giá trị — chỉ xác nhận key tồn tại trong `.env`, xem mục 6: `DATABASE_URL`/`DIRECT_URL` key có mặt nhưng nội dung password nằm trong value, không kiểm tra value theo rule không-in-secrets).

Status: DONE
Summary: Stack production khỏe (8/8 healthy, latency 3-40ms, log sạch), hầu hết P0/P1 hạ tầng của audit 07-16 đã fix thật trong code; vấn đề lớn nhất là Traefik/Let's Encrypt loop lỗi ACME liên tục do `DOMAIN=localhost` trên server (domain công khai + TLS trong docs chưa bao giờ hoạt động thật), monitoring stack (Prometheus/Grafana/Loki) chưa từng được khởi chạy dù code đã wire sẵn, disk 87% đầy chủ yếu do các project khác dùng chung host chứ không phải riêng shopee.review, và container vẫn chạy root + không có resource limit (rủi ro cao hơn bình thường vì host dùng chung).

Top 5 findings:
1. [Nghiêm trọng] Traefik liên tục lỗi ACME mỗi 15-60s vì server `.env` `DOMAIN=localhost` — domain/TLS công khai trong README/deployment-guide chưa bao giờ hoạt động thật; cần set domain thật hoặc tắt router HTTPS.
2. [Cao] Monitoring stack (Prometheus/Grafana/Loki) có đầy đủ trong `monitoring/docker-compose.monitoring.yml` và code đã wire `/metrics`+alerts nhưng **chưa từng chạy** trên server — không có observability thực tế ngoài log thủ công.
3. [Cao, bối cảnh host dùng chung] Container backend/frontend/nginx chạy root, không có `mem_limit`/`cpus` nào (trừ meilisearch) — trên 1 host chia sẻ ~10 project khác, một leak có thể ảnh hưởng toàn bộ máy.
4. [Trung bình] nginx `worker_connections 4096` vượt soft nofile-limit container (1024) — warning thật trong log, cần `ulimits` trong compose.
5. [Trung bình] Image `shopeereview-backend` 2.71GB do thiếu `pnpm prune --prod` trước stage runner + Playwright chromium — có thể giảm đáng kể; đồng thời disk server 87% đầy chủ yếu do image/build-cache của các project khác (42GB images, 94% reclaimable) chứ không phải do riêng app này.
