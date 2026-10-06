# Tổng hợp audit toàn hệ thống — 2026-10-06 (HEAD 983a01e)

Nguồn: 5 audit song song (read-only). Chi tiết + file:line nằm trong từng báo cáo:
- Backend: `code-reviewer-261006-2114-backend-audit.md`
- Frontend/UX: `code-reviewer-261006-2114-frontend-ux-audit.md`
- Database: `code-reviewer-261006-2114-database-audit.md`
- Infra/ops: `debugger-261006-2115-infra-ops-audit.md`
- Toolchain: `tester-261006-2115-toolchain-health.md`

## Kết luận

Nền móng tốt: typecheck sạch, 84/84 unit test pass, build pass, không drift schema, counter khớp, backup chạy hằng ngày, stack healthy (3–40ms). Phần lớn finding của các audit tháng 7 đã được sửa thật.

Chưa "chuẩn & clean": còn 1 lỗ hổng Critical, vài lỗ hổng High về auth/DB, một loạt lỗi UX hiển thị sai trạng thái, và gần như không có test cho frontend.

## Đã tự xác minh lại (orchestrator)

- `categories.controller.ts:15-31`: POST/PATCH/DELETE chỉ có `JwtAuthGuard`, không admin guard; PATCH dùng `Partial<CreateCategoryDto>` nên ValidationPipe không whitelist, body đi thẳng vào `prisma.category.update`. Prod: 0 admin / 15 user → chưa thấy dấu hiệu bị khai thác (log chỉ có từ lần restart hôm nay).
- `click_logs_id_seq`, `notifications_id_seq` vẫn `integer`.
- Prod `.env` không có `POSTGRES_PASSWORD` → dùng default `shopee_review_dev` trong compose; role app `rolsuper = t`.
- Frontend không có cấu hình ESLint; `lint` thực chất chỉ chạy `tsc`.
- Next.js 15.5.19: advisory RCE "Windows" không áp dụng (server Linux); advisory Image Optimizer AVIF + Server Actions DoS có áp dụng → nâng patch 15.5.2x là đủ.

## Ưu tiên

### P0 — Bảo mật (sửa ngay)
1. Category endpoints: thêm `AdminGuard`, `UpdateCategoryDto` class, map field tường minh.
2. OAuth account linking: không auto-link vào tài khoản chưa xác minh email (hoặc xoá password + thu hồi session khi link), kiểm `email_verified`.
3. DB: đặt `POSTGRES_PASSWORD` mạnh, role app không superuser (cần backup + đổi DATABASE_URL/pgBouncer).
4. Nâng Next.js lên bản patch mới nhất 15.5.x; xử lý các advisory high còn lại (`pnpm audit`: 3 critical / 40 high, phần lớn transitive).

### P1 — Đúng đắn & vận hành
5. `ALTER SEQUENCE ... AS bigint` cho click_logs/notifications (migration mới).
6. Ban user: ẩn nội dung ở feed/explore/trending/search/detail và chặn redirect `/r/:postId` (chờ quyết định sản phẩm).
7. Rate limit bị đếm đôi: bỏ `ThrottlerGuard` gắn ở route.
8. Metrics interceptor ghi sai status → alert 5xx không bao giờ bắn.
9. `ADMIN_BOOTSTRAP_USERNAME` chưa đặt → không có admin cho moderation.
10. `DOMAIN=localhost` làm Traefik lặp lỗi ACME; quyết định có public domain hay chỉ dùng qua Tailscale.

### P1 — UX người dùng thấy ngay
11. Nút Follow trên profile sai trạng thái (SSR không có cookie + cache).
12. Bookmark trên trang chi tiết luôn "chưa lưu" + API toggle → bấm lần đầu là bỏ lưu.
13. Tab "Đang theo dõi" hiện empty-state khi đang tải/lỗi.
14. Font: Material Symbols tải full nhiều MB qua `@import`; class `font-*` trỏ `'Inter'` không khớp tên next/font.
15. N+1 reaction request trên feed (20 request/trang) → trả trạng thái reaction kèm feed.
16. Comment: IME tiếng Việt gửi khi đang gõ, comment trùng, reply lỗi mất chữ, chỉ có trang comment đầu.
17. Mobile: tab bar bị header che, toast đè bottom nav; login redirect không quay về trang cũ.

### P2 — Clean & nền tảng phát triển
18. ESLint thật cho frontend + backend, chạy trong CI.
19. Test: frontend 0 test; backend thiếu test cho posts/users/uploads/search/notifications; thêm e2e smoke.
20. Index: notifications `(recipient_id, id DESC)`, index category/comment top-level/follower fanout; bỏ 3 index thừa.
21. Docker: non-root user, `mem_limit`/`cpus`, `pnpm prune --prod` (backend image 2.71GB), nginx `worker_connections` > nofile.
22. Postgres: `statement_timeout`, `idle_in_transaction_session_timeout`, `pg_stat_statements`; backup offsite + thử restore.
23. Monitoring stack chưa từng chạy; quyết định bật hay gỡ khỏi docs.
24. Docs lệch thực tế (Traefik/Coolify/TLS/monitoring), env thừa `NEXT_PUBLIC_API_URL`/`PUBLIC_API_URL` trên server.
25. Commit fix `.dockerignore` (`**/node_modules`).

## Câu hỏi chưa giải quyết
1. Ban user = ẩn toàn bộ nội dung + chặn affiliate redirect, hay chỉ khoá đăng nhập?
2. Có cho đăng nhập khi chưa xác minh email không?
3. Hệ thống có public domain không, hay chỉ chạy nội bộ qua Tailscale? (quyết định Traefik/certbot/DOMAIN)
4. Dữ liệu prod (15 user, 40 post) là seed hay user thật?
5. Bật monitoring stack hay bỏ khỏi docs?
6. Bookmark API giữ toggle hay chuyển sang set/unset idempotent?
7. Username admin cho `ADMIN_BOOTSTRAP_USERNAME`?
