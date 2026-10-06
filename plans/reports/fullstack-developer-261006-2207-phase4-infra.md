# Phase 4 (Infra) — Audit Remediation — Báo cáo triển khai

Ngày: 2026-10-06. Plan: `plans/261006-2207-audit-remediation/plan.md`, Phase 4.

## Files Modified / Created / Deleted

**Thay đổi (modified):**
- `docker-compose.yml` — bỏ certbot, Traefik labels mới (apex + www redirect), `mem_limit`/`cpus`/log-rotation/ulimits cho mọi service, Postgres role không-superuser + command flags, backup umask, `POSTGRES_PASSWORD` bắt buộc, pgbouncer pin digest.
- `apps/backend/Dockerfile` — non-root user, `pnpm prune --prod` + giữ lại `prisma` CLI, `COPY --chown` thay vì `RUN chown -R` (tránh nhân đôi layer), `PLAYWRIGHT_BROWSERS_PATH` cố định.
- `apps/frontend/Dockerfile` — non-root user, `COPY --chown`.
- `.dockerignore` — áp fix `**/node_modules` (đã có uncommitted trên server, giờ có trong Mac repo).
- `.env.example` — `POSTGRES_PASSWORD` mới, `DOMAIN=shopee.review` (gộp 2 chỗ trùng thành 1), bỏ `CERTBOT_EMAIL`, sửa comment Observability/Grafana, role `shopee_review_app` trong DATABASE_URL/DIRECT_URL mẫu.
- `apps/backend/src/app.module.ts` — bỏ import/registration `MetricsModule`, bỏ `ignore: /metrics` trong Pino autoLogging.
- `apps/backend/src/main.ts` — bỏ exclude `metrics` khỏi global prefix.
- `apps/backend/package.json` — bỏ `@willsoto/nestjs-prometheus`, `prom-client`.
- `pnpm-lock.yaml` — regenerate (chỉ xoá 2 package trên + transitive deps; diff đã verify sạch, không đụng thay đổi của Phase 1/2).
- `nginx/conf.d/app.conf` — bỏ ACME challenge location, thêm `Strict-Transport-Security` (Traefik giờ lo TLS thật).
- `nginx/snippets/app-locations.conf` — bỏ location `/metrics`.
- `monitoring/docker-compose.monitoring.yml` — bỏ Prometheus, thêm `mem_limit`/`cpus`/log-rotation cho Loki/Promtail/Grafana.
- `monitoring/grafana/provisioning/datasources/datasources.yml` — chỉ còn datasource Loki.
- `monitoring/loki/loki-config.yml` — retention 168h → 336h (14 ngày).
- `README.md`, `docs/deployment-guide.md`, `docs/system-architecture.md` — cập nhật theo scope (chi tiết bên dưới).

**Tạo mới:**
- `postgres/init/01-app-role.sh` — init script (chỉ chạy lần đầu trên volume rỗng): tạo `pg_stat_statements`, tạo role `shopee_review_app` (NOSUPERUSER) và chuyển ownership DB sang role đó.
- `docker-compose.monitoring.yml` — đã có trước nhưng Write lại toàn bộ nội dung (file vẫn untracked trong git, đúng trạng thái cũ).

**Xoá:**
- `apps/backend/src/metrics/` (4 file: module, providers, collector service, http interceptor).
- `nginx/conf.d/app-tls.conf.disabled`, `nginx/certbot/` (toàn bộ, chỉ có `.gitkeep`).
- `monitoring/prometheus/` (prometheus.yml, alerts.yml).
- `monitoring/grafana/provisioning/dashboards/backend-overview.json` (dashboard dùng PromQL, không còn datasource).

Không đụng `packages/database/**`, và trong `apps/backend/src/app.module.ts`/`main.ts` chỉ sửa đúng các dòng liên quan Metrics như đã giao.

## Quyết định kỹ thuật đáng chú ý (đã verify thực nghiệm trên server, không đoán)

1. **Postgres không thể tự tước SUPERUSER của chính bootstrap role.** Thử nghiệm thật trên container postgres:16-alpine throwaway: `ALTER ROLE shopee_review WITH NOSUPERUSER` khi đang kết nối chính role đó → `ERROR: permission denied to alter role / DETAIL: The bootstrap user must have the SUPERUSER attribute`. Đây là giới hạn cứng của Postgres (bootstrap role luôn giữ superuser), không phải lỗi cấu hình. → Thiết kế lại thành **2 role**: `shopee_review` (bootstrap superuser, không dùng sau init) và `shopee_review_app` (NOSUPERUSER, là owner của DB, dùng cho mọi kết nối runtime — pgbouncer/backend/db-backup). Đã verify: role mới `rolsuper=f`, là owner DB (`pg_database_owner` pseudo-role của PG15+ tự động cho owner quyền trên schema `public`), tạo bảng + `CREATE EXTENSION pg_trgm` (trusted) thành công không cần GRANT thêm.
2. **`pnpm prune --prod` trong Docker cần `CI=true`** (không có TTY → pnpm hỏi xác nhận xoá node_modules, build fail).
3. **`prisma` CLI là devDependency của `@app/database`** (đúng cho local dev) nhưng `CMD` cần nó lúc runtime để `prisma migrate deploy`. Thử 2 cách:
   - Patch package.json trong layer (không đụng file thật) → vỡ vì `pnpm prune` re-validate khớp lockfile.
   - `pnpm add --filter @app/database --save-prod --prod prisma@6.19.3` sau prune (pin đúng version lockfile `6.19.3`) → **hoạt động**, không đụng `packages/database/package.json` thật trên đĩa (chỉ sửa trong image layer).
4. **`RUN chown -R app:app /app` sau các `COPY` là anti-pattern nghiêm trọng**: BuildKit nhân đôi toàn bộ cây file đã copy vào 1 layer mới (tăng +502MB thực đo). Đã sửa dùng `COPY --chown=app:app` trên từng dòng COPY — fix này áp dụng cho cả backend và frontend Dockerfile.
5. **`pnpm-lock.yaml` phải regenerate** sau khi gỡ 2 deps (không thể chỉ sửa package.json — frozen-lockfile build fail ngay ở bước đầu). Đã chạy `pnpm install --no-frozen-lockfile` trên server (không chạy trên Mac theo đúng ràng buộc), diff lockfile verify chỉ xoá đúng `@willsoto/nestjs-prometheus`, `prom-client` + transitive (`bintrees`, `tdigest`) — không ảnh hưởng thay đổi của Phase 1/2.
6. **www → apex redirect** dùng Traefik `redirectregex` middleware (2 router/host riêng cho apex và `www.$DOMAIN`, cả HTTP và HTTPS) thay vì cố nhét logic host-conditional vào 1 router — đơn giản, mỗi router tự xin cert riêng qua `letsencrypt` resolver (không vấn đề gì với Let's Encrypt cho site nhỏ).
7. **HSTS**: trước đây bị gate trong `app-tls.conf.disabled` vì nginx tưởng đang serve HTTP thật. Thực tế Traefik luôn termination TLS thật ở biên trước khi vào nginx (nginx chỉ nói chuyện nội bộ qua network `coolify`), nên giờ set HSTS unconditionally trong `app.conf` — không còn 2 file nginx config song song.

## Image Sizes — Before/After (đo thật trên server, `docker images`)

| Image | Trước (live) | Sau (dev build) | Chênh lệch |
|---|---|---|---|
| backend | 2.71GB | 2.43GB | **-280MB (~10%)** — phần lớn do `pnpm prune --prod` (node_modules layer 684MB → 478MB); Playwright/Chromium (1.07GB layer) **giữ nguyên có chủ đích** (scraper fallback `apps/backend/src/scraper/shopee-playwright-fallback-scraper.ts` dùng thật, không mock) |
| frontend | 472MB | 475MB | +3MB (không đáng kể — thêm user/group system) |

Lưu ý: `node_modules` trong image mới vẫn còn vài devDependency binary (`tsc`/`tsx` trong `packages/database/node_modules/.bin`) do lệnh `pnpm add --prod` re-resolve rộng hơn dự kiến; không ảnh hưởng runtime/bảo mật (không execute), chỉ còn ~206MB tiềm năng tối ưu thêm nếu muốn — không làm tiếp vì đã đạt mục tiêu chính (bỏ Playwright-blocking devDeps nặng khác, image nhỏ hơn, không vỡ runtime) và tránh rủi ro vỡ build thêm trong phạm vi 1 phase.

## Validation đã chạy trên `~/working-sources/shopee.review-dev` (ssh homelab)

| Check | Kết quả |
|---|---|
| `docker compose -p shopeereview-dev config` | OK (exit 0, không warning) |
| `docker compose -p shopeereview-dev -f docker-compose.yml -f docker-compose.monitoring.yml config` | OK |
| `docker compose build backend` | OK, 2.43GB |
| `docker compose build frontend` | OK, 475MB |
| Backend container: `whoami` | `app` (uid 999, non-root) |
| Backend container: prisma CLI tại `packages/database/node_modules/.bin/prisma` | tồn tại, executable |
| `pnpm --filter @app/backend typecheck` | PASS (0 lỗi) |
| `pnpm --filter @app/backend test` | **PASS — 13 file, 135/135 test** (bao gồm cả test mới của Phase 1/2: categories-authz, email-normalization, oauth-account-linking, moderation-soft-delete — không bị ảnh hưởng bởi việc gỡ metrics) |
| `nginx -t` (container throwaway, mount 3 file config thật) | `syntax is ok` / `test is successful`; có warning `worker_connections exceed open file limit` khi KHÔNG set ulimit (đúng behaviour cũ) — set `--ulimit nofile=65536:65536` (khớp compose) thì **hết warning** |
| Postgres init script (`postgres/init/01-app-role.sh`) trên container throwaway `postgres:16-alpine` | `CREATE EXTENSION` / `CREATE ROLE` / `ALTER DATABASE` chạy sạch; verify `shopee_review_app.rolsuper=f`, là DB owner, tạo bảng + `CREATE EXTENSION pg_trgm` thành công |
| Frontend build (qua Docker, có log Next.js build) | 20/20 static pages generated, không lỗi |

Image/container dev đã bị xoá sau khi đo (`docker image rm shopeereview-dev-backend shopeereview-dev-frontend`); container test Postgres (`pg-init-test*`) đã `docker rm -f`. Không `up` bất kỳ service nào của `docker-compose.yml`/`docker-compose.monitoring.yml` thật (tránh đụng port 65432/8081 của live stack) — đúng ràng buộc đề bài.

## Scope đã làm theo từng mục

1. **Containers**: non-root cho backend/frontend (`COPY --chown`, uid/gid "app" hệ thống); nginx giữ root master (chuẩn image `nginx:1.27-alpine`), worker tự drop xuống user `nginx` qua `user nginx;` trong `nginx.conf` — đã verify không cần sửa. `mem_limit`/`cpus` cho mọi service (db 512m/1cpu, redis 640m/0.5, pgbouncer 128m/0.3, backend 1536m/1.5 — có headroom Playwright, frontend 512m/1, nginx 256m/0.5, meilisearch 512m/1 giữ nguyên, db-backup 256m/0.3). Restart policy + healthcheck giữ nguyên. `ulimits.nofile: 65536/65536` cho nginx — verify hết warning.
2. **Backend image**: `pnpm prune --prod`, giữ Playwright chromium (scraper fallback dùng thật — đã grep `scraper.service.ts:28` gọi `playwrightScraper.scrapeProduct`). Size 2.71GB → 2.43GB.
3. **Postgres**: `POSTGRES_PASSWORD` bắt buộc (`:?`) ở `db`/`pgbouncer`/`db-backup`/backend DATABASE_URL+DIRECT_URL (không còn default `shopee_review_dev` trong compose). Role app non-superuser qua `postgres/init/01-app-role.sh` (2-role design, lý do kỹ thuật ở trên). `statement_timeout=30000`, `idle_in_transaction_session_timeout=30000`, `pg_stat_statements` qua `command:` flags của `db`. Runbook rotate live DB viết trong `docs/deployment-guide.md` ("Postgres Role Rotation") — **chưa chạy trên live**, chỉ là tài liệu.
4. **Backups**: `db-backup` command override `umask 0077 && exec /init.sh` (verify qua `docker image inspect`/`docker run --entrypoint sh ... cat /init.sh` rằng image gốc không tự set umask nào) → dump 600, dir 700. Restore-test command (disposable container) + lưu ý offsite là follow-up, chưa build — đã viết trong deployment-guide.md.
5. **.dockerignore**: áp fix `**/node_modules` (lấy đúng nội dung uncommitted từ server qua `ssh homelab cat .dockerignore`).
6. **.env.example**: gộp `DOMAIN` (trùng 2 chỗ) → `shopee.review`; bỏ `CERTBOT_EMAIL`; thêm `POSTGRES_PASSWORD` (thiếu trước đó, compose giờ `:?` nên bắt buộc phải có để `docker compose up -d db` ở Local Setup không vỡ); `GRAFANA_PASSWORD` đổi default yếu "admin" → placeholder rõ ràng. `NEXT_PUBLIC_API_URL`/`PUBLIC_API_URL`: grep xác nhận cả 2 đều không xuất hiện trong `.env.example` hiện tại (đã sạch từ trước) — chỉ còn 1 dòng stale trong README (đã sửa, xem dưới).
7. **Docs**: `README.md` (bỏ `NEXT_PUBLIC_API_URL` khỏi bảng env — stale, không còn dùng; cập nhật dòng Container/Monitoring; thêm row `POSTGRES_PASSWORD`; bỏ `CERTBOT_EMAIL` row), `docs/deployment-guide.md` (viết lại Overview/Database & Pooling/Ports & TLS/Monitoring/Nginx/Backup & Restore + 2 section mới: "Postgres Role Rotation", "Remote Development"), `docs/system-architecture.md` (bỏ Metrics module, bỏ `/metrics` khỏi topology + security + observability, viết lại section Observability logs-only).

## Live-rollout steps (orchestrator chạy sau, theo đúng thứ tự — KHÔNG tự chạy trong phase này)

Giả định: code đã merge/commit, user đã duyệt deploy.

```bash
# 0. (User làm riêng, ngoài scope code) Trỏ DNS A record shopee.review (+ www) về IP public server; xác nhận router forward 80/443 vào Coolify.

# 1. Backup DB hiện tại TRƯỚC khi đụng gì (seed data nhưng vẫn backup theo quyết định user).
ssh homelab 'cd ~/working-sources/shopee.review && docker compose exec -T db pg_dump -U shopee_review -d shopee_review | gzip > backups/manual/pre-phase4-$(date +%Y%m%d-%H%M%S).sql.gz'

# 2. Đồng bộ code đã duyệt vào server (rsync hoặc git pull tuỳ quy trình team đang dùng).

# 3. Cập nhật .env SERVER (sửa tay, không commit):
#    - POSTGRES_PASSWORD=<mật khẩu mạnh mới, openssl rand -base64 32>
#    - DOMAIN=shopee.review   (hiện đang là "localhost" — nguyên nhân Traefik loop lỗi ACME theo audit)
#    - Xoá CERTBOT_EMAIL nếu còn (không dùng nữa)
#    - GRAFANA_PASSWORD=<mật khẩu mạnh> nếu định bật monitoring
#    - Xác nhận ADMIN_BOOTSTRAP_USERNAME có set (audit cũ ghi nhận server .env chưa có — ngoài scope phase này nhưng liên quan)

# 4. Rotate role Postgres theo đúng runbook docs/deployment-guide.md#postgres-role-rotation
#    (tạo shopee_review_app, chuyển owner — KHÔNG xoá/đổi role shopee_review cũ, chỉ ngừng dùng nó).
#    Review kỹ bước 3 của runbook TRƯỚC khi chạy — đây là thay đổi credential ảnh hưởng toàn app.

# 5. Build + lên stack mới:
ssh homelab 'cd ~/working-sources/shopee.review && docker compose build backend frontend'
ssh homelab 'cd ~/working-sources/shopee.review && docker compose up -d --remove-orphans'
#    `--remove-orphans` sẽ tự dọn container `certbot` cũ (service đã bị xoá khỏi compose file).

# 6. Verify:
ssh homelab 'cd ~/working-sources/shopee.review && docker compose ps'   # mọi service "healthy", KHÔNG còn certbot
ssh homelab 'curl -s http://127.0.0.1:8081/api/health'                  # {"ok":true,...}
#    Verify Traefik hết loop lỗi ACME (docker logs coolify-proxy | tail, không còn lỗi lặp lại Host(`localhost`))
#    Verify HTTPS thật: curl -I https://shopee.review (sau khi DNS + Let's Encrypt xong, có thể mất vài phút)
#    Verify role DB:
ssh homelab 'cd ~/working-sources/shopee.review && docker compose exec -T db psql -U shopee_review -d shopee_review -c "SELECT rolname, rolsuper FROM pg_roles WHERE rolname='"'"'shopee_review_app'"'"';"'

# 7. (Tuỳ chọn) Bật monitoring logs-only:
ssh homelab 'cd ~/working-sources/shopee.review && docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d'
#    Truy cập Grafana qua SSH tunnel: ssh -L 3001:127.0.0.1:3001 homelab, mở http://localhost:3001

# 8. Dọn image cũ không dùng (sau khi xác nhận stack mới chạy ổn >=1 ngày):
ssh homelab 'docker image prune -f'   # chỉ dangling, an toàn; KHÔNG chạy -a trên host dùng chung nếu chưa hỏi các project khác (xem audit mục 7)
```

## Bỏ qua / để sau (đúng scope, không tự ý mở rộng)

- Offsite backup (rclone/S3 sync) — chỉ ghi chú trong docs, chưa build, đúng yêu cầu "note as follow-up (don't build it)".
- CSP header cho nginx — audit infra có đề xuất nhưng user không yêu cầu trong scope Phase 4; không thêm để tránh scope creep.
- Dọn 40GB+ image/build-cache của các project KHÁC trên host (ngoài phạm vi shopee.review, cần hỏi chủ các project kia — đã nêu trong audit, không phải việc của phase này).
- Thu nhỏ thêm `node_modules` runtime image (còn ~206MB devDependency binary sót lại do `pnpm add --prod` re-resolve rộng) — ghi nhận nhưng không tối ưu tiếp, rủi ro/lợi ích không đáng trong 1 phase.
- Không sửa `.github/workflows/ci.yml` (lint trong CI, build+push image...) — thuộc Phase 5, ngoài file ownership của phase này.

## Unresolved Questions

1. Server `.env` hiện `DOMAIN=localhost` (theo audit) — cần user tự set `DOMAIN=shopee.review` sau khi DNS trỏ xong, bước 3 live-rollout ở trên.
2. Role rotation DB sống (bước 4 live-rollout) thay đổi credential ứng dụng dùng — cần người approve trước khi chạy trên live, như user đã yêu cầu rõ ("do NOT execute it on live").
3. `ADMIN_BOOTSTRAP_USERNAME` trên server .env hiện trống (audit cũ đã hỏi, chưa có câu trả lời) — ngoài scope Phase 4 nhưng ảnh hưởng tới việc có thể dùng `/admin/queues` sau khi deploy xong.

Status: DONE
Summary: Đã implement đầy đủ 7 mục scope Phase 4 (non-root containers + resource limits, backend image prune (2.71GB→2.43GB giữ Playwright), Postgres non-superuser role + timeouts + pg_stat_statements + backup permissions, .dockerignore fix, .env.example dọn sạch, docs cập nhật khớp thực tế Coolify Traefik + logs-only monitoring); mọi thay đổi đã validate trên server dev clone (compose config, build 2 image, typecheck, 135 test pass, nginx -t, Postgres init script test thực nghiệm) mà không đụng live stack hay commit gì.
