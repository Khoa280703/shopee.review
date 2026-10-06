# Audit remediation — làm hệ thống chuẩn & clean

Status: phases 1–5 done; phase 6 waiting on DNS · Created 2026-10-06 · Source: `plans/reports/orchestrator-261006-2119-full-system-audit-synthesis.md` (+ 5 báo cáo con)

## Outcome
Hệ thống an toàn, đúng nghiệp vụ, UX mượt, có lint/test thật và chạy public tại `https://shopee.review` — nền sạch để phát triển tính năng tiếp.

## Quyết định của user (2026-10-06)
1. Ban 2 mức, mọi gỡ nội dung là **xoá mềm** (khôi phục được khi kháng cáo).
2. **Cho phép** đăng nhập khi chưa xác minh email.
3. Public domain: `shopee.review`.
4. Dữ liệu prod là seed → được reset (vẫn backup trước).
5. Monitoring = **chỉ log**, làm chuẩn (bỏ Prometheus/metrics).
6. Admin username: user cung cấp sau.

## Non-goals
Tính năng mới; đổi stack; tối ưu cho multi-instance backend.

## Cách làm việc
Sửa code trên Mac → rsync sang clone riêng trên server `~/working-sources/shopee.review-dev` → chạy typecheck/lint/test/build ở đó. Deploy vào stack live chỉ sau khi user duyệt commit. Backup DB trước mọi migration.

## Phases
| # | Phase | Phụ thuộc | Trạng thái |
|---|-------|-----------|-----------|
| 1 | Bảo mật P0 | – | done |
| 2 | Moderation 2 mức + xoá mềm + DB hygiene | 1 | done |
| 3 | UX fixes | 1 (song song với 4) | done |
| 4 | Infra: domain, Docker, log-only monitoring, Postgres | 1 | done (deployed 2026-10-07) |
| 5 | Chất lượng: ESLint, test, CI | 2,3,4 | done |
| 6 | Docs + deploy + verify public | 5 | deployed; HTTPS chờ DNS |

### Phase 1 — Bảo mật P0
- Categories: `AdminGuard` cho POST/PATCH/DELETE; `UpdateCategoryDto` (class, PartialType); service map field tường minh.
- OAuth link vào tài khoản email **chưa xác minh**: xoá `passwordHash`, bump `tokenVersion`, xoá sessions cũ, set `emailVerified`; bỏ qua link nếu Google trả `email_verified=false`. Giữ nguyên việc cho login khi chưa xác minh.
- Email: chuẩn hoá lowercase+trim khi đăng ký/đăng nhập/OAuth/reset; unique không phân biệt hoa thường (migration, data seed).
- Throttler: bỏ `ThrottlerGuard` gắn ở route (đếm đôi), giữ `@Throttle` per-route.
- Dependencies: Next.js lên patch 15.5.x mới nhất; xử lý advisory critical/high trong `pnpm audit --prod` (bump trực tiếp hoặc `pnpm.overrides`).
- Tests: authz categories, OAuth link, email normalize.
Acceptance: user thường gọi category write → 403; PATCH body lạ bị strip/reject; `pnpm audit --prod` không còn critical, high giảm tối đa; test pass.

### Phase 2 — Moderation 2 mức + xoá mềm + DB
- Mức 1 `suspendedAt`: khoá đăng nhập (bump tokenVersion), nội dung vẫn hiện.
- Mức 2 `bannedAt`: khoá + ẩn toàn bộ post/comment ở feed/explore/trending/search/detail/profile + `/r/:postId` trả 404, Meili loại bỏ; unban khôi phục.
- Post/Comment: `deletedAt` (+ `deletedBy`, `deleteReason`); moderation và user xoá đều là xoá mềm; admin restore endpoint; mọi query lọc `deletedAt IS NULL`.
- Sequences `click_logs`/`notifications` → bigint.
- Index: notifications `(recipient_id, id DESC)`, category filter, comment top-level, follower fanout; bỏ 3 index thừa.
- Fix spam notification khi toggle reaction/follow; click dedup race.
Acceptance: test cho 2 mức ban + xoá mềm/restore; `prisma migrate diff` rỗng; EXPLAIN dùng index mới.

### Phase 3 — UX
Follow/bookmark state đúng (SSR nhận viewer state hoặc fetch client, bookmark API idempotent set/unset); tab Following có skeleton/error; font (Material Symbols subset/self-host, sửa tên font Tailwind); reaction của viewer trả kèm feed (bỏ N+1); comment (IME `isComposing`, chống trùng, giữ text khi lỗi, phân trang); mobile (sticky header/tab, toast trên bottom nav); login returnTo; Socket.io chỉ mở khi cần; SEO JSON-LD/canonical.

### Phase 4 — Infra
- `DOMAIN=shopee.review`; bỏ container certbot (Coolify Traefik lo TLS). **User**: trỏ DNS A `shopee.review` (+`www`) về IP public server; xác nhận router forward 80/443.
- Docker: non-root, `mem_limit`/`cpus`, log rotation (json-file max-size), backend `pnpm prune --prod`, nginx `worker_connections` ≤ nofile hoặc tăng ulimit.
- Log-only monitoring: gỡ Prometheus + `MetricsModule` + alerts; giữ Pino JSON + Loki/Promtail + Grafana (chỉ datasource Loki, bind loopback, retention 14 ngày); Sentry giữ no-op khi không có DSN.
- Postgres: password mạnh trong `.env`, role app không superuser, `statement_timeout`, `idle_in_transaction_session_timeout`, `pg_stat_statements`; backup quyền 600 + thử restore.
- Commit `.dockerignore` fix; dọn env thừa (`NEXT_PUBLIC_API_URL`, `PUBLIC_API_URL`).

### Phase 5 — Chất lượng
ESLint flat config (backend + frontend, `next/core-web-vitals`, typescript-eslint) + fix lỗi; Vitest + Testing Library cho frontend (các component đã sửa ở Phase 3); test backend cho posts/users/uploads/search/notifications chính; CI chạy lint + typecheck + test + build.

### Phase 6 — Docs, deploy, verify
Cập nhật README/deployment-guide/system-architecture cho đúng thực tế; deploy; verify `https://shopee.review` (TLS, health, luồng chính) qua browser.

## Rủi ro / rollback
Mỗi phase là commit riêng; DB dump trước migration (`backups/manual/`); dữ liệu seed nên rollback DB = restore dump.

## Câu hỏi mở
- Admin username (user sẽ báo).
- DNS + port-forward 80/443 cho `shopee.review` (user thao tác ở Spaceship/router).
