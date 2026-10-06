# Database Audit — shopee.review (Prisma 6 / PG 16.13 / pgBouncer 1.25.2)

Ngày: 2026-10-06. HEAD local + prod: `983a01e`. Chế độ: READ-ONLY (mọi SQL chạy trong `BEGIN TRANSACTION READ ONLY … ROLLBACK`; chỉ SELECT/EXPLAIN không ANALYZE, pg_stat/pg_catalog; `prisma migrate diff` chỉ introspect). Không in PII — chỉ số đếm tổng hợp.

## Scope
- Files: `packages/database/prisma/schema.prisma` (322L), 18 migrations, `apps/backend/src/**` (feed, posts, search, notifications, social, users, tracker, stats, moderation, maintenance, auth, queue processors), `docker-compose.yml`, `apps/backend/Dockerfile`, `.github/workflows/ci.yml`.
- Prod: `ssh homelab`, compose project `shopeereview`, service `db`, `pgbouncer`, `db-backup`.
- Bối cảnh quan trọng phát hiện khi scout:
  - Prod DB đứng ở 6/18 migrations từ 2026-06-28 tới **hôm nay 13:58 UTC** — 12 migrations (likes→reactions, BIGINT, sessions, trgm, …) vừa apply cách lúc audit ~20 phút (`_prisma_migrations.started_at`). Postgres restart lúc 13:57:45 UTC → pg_stat counters chỉ có ~18 phút → **không đủ dữ liệu để kết luận "unused index" từ pg_stat_user_indexes**; phần index dựa trên phân tích tĩnh + EXPLAIN.
  - Dữ liệu prod rất nhỏ (DB 9999 kB): users 15, posts 40, comments 83, reactions 87, follows 38, click_logs 1, notifications 0, sessions 0, reports 0. Mọi post/user tạo 2026-06-22…06-29 (dạng seed).

## Overall Assessment
Schema nền tảng tốt: junction tables dùng composite PK (reactions/bookmarks/follows/blocks → uniqueness ở DB), report idempotent bằng unique, FK đầy đủ, counter atomic + reconcile đêm, MV refresh CONCURRENTLY, partial unique cho fanout, không drift Prisma. Phần lớn finding của 2 report trước đã FIXED. Nhưng có **1 bug ngầm nghiêm trọng** (migration BIGINT không có tác dụng vì sequence vẫn int4), **app chạy bằng superuser với mật khẩu dev công khai**, ban không gỡ nội dung/affiliate link, và vài index chưa khớp query thực tế.

---

## Critical
Không có finding Critical khả khai thác ngay (DB chỉ bind loopback, mạng compose riêng).

## High

### H1. Migration `bigint_log_pks` KHÔNG mở rộng horizon — sequence vẫn `integer`
- Evidence: `migrations/20260710115500_bigint_log_pks/migration.sql:4-5` chỉ `ALTER COLUMN "id" SET DATA TYPE BIGINT`. `ALTER COLUMN TYPE` không đổi kiểu sequence (SERIAL tạo `AS integer`).
  ```sql
  SELECT sequencename, data_type, max_value FROM pg_sequences ORDER BY 1;
  -- click_logs_id_seq    | integer | 2147483647
  -- notifications_id_seq | integer | 2147483647
  ```
- Impact: tới 2^31 lần nextval → `nextval: reached maximum value of sequence` → mọi click tracking + mọi notification insert fail (fanout NEW_POST là bảng tăng nhanh nhất). Comment schema.prisma:213-214, 232-233 và report trước (H3) tưởng đã fix. `prisma migrate diff` không phát hiện (Prisma không model kiểu sequence).
- Fix (migration mới):
  ```sql
  ALTER SEQUENCE click_logs_id_seq AS bigint;      -- max_value tự nâng lên bigint max
  ALTER SEQUENCE notifications_id_seq AS bigint;
  ```
  Thêm assert vào CI (sau `migrate deploy`): `SELECT 1 FROM pg_sequences WHERE sequencename IN ('click_logs_id_seq','notifications_id_seq') AND data_type <> 'bigint'` → fail nếu có row.

### H2. App/pgBouncer/backup dùng role **superuser** với mật khẩu dev công khai `shopee_review_dev`
- Evidence:
  - `docker-compose.yml:7,53,88,117-118`: `${POSTGRES_PASSWORD:-shopee_review_dev}`; prod `.env` KHÔNG có key `POSTGRES_PASSWORD` (kiểm bằng `grep -q "^POSTGRES_PASSWORD=." .env` → UNSET); `docker compose config` → giá trị đang dùng = default dev password (đã so sánh, không in).
  - `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=current_user;` → `shopee_review | t | t | t`.
  - DB bind `127.0.0.1:65432` (FIXED phần port), nhưng network `shopeereview_default` chứa cả frontend, nginx, certbot, meilisearch, backend (Playwright scrape trang ngoài).
- Impact: bất kỳ foothold nào trong 1 container cùng network hoặc 1 user local trên host → superuser DB → `COPY … TO PROGRAM` = shell trong container db, đọc/ghi toàn bộ dữ liệu (email, bcrypt hash, reset token). Mật khẩu nằm trong repo public-to-team.
- Fix: (1) đặt `POSTGRES_PASSWORD` mạnh trong prod `.env`, đổi bằng `ALTER ROLE … PASSWORD` (volume đã init nên env không tự đổi), cập nhật pgbouncer userlist; đổi compose sang `${POSTGRES_PASSWORD:?required}`. (2) Tạo role app không superuser: `CREATE ROLE app LOGIN PASSWORD …; GRANT CONNECT …; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES …; GRANT USAGE ON ALL SEQUENCES …;` + owner của MV phải là role refresh (REFRESH cần ownership) → để role migration (owner) và app role là member, hoặc chạy refresh bằng owner. DIRECT_URL (migrate) giữ owner role non-superuser; superuser chỉ dùng tay.

### H3. Ban không gỡ nội dung: bài/affiliate link của user bị ban vẫn hiển thị và vẫn redirect kiếm hoa hồng (prior L6 — STILL OPEN)
- Evidence: chỉ `users.service.ts:48` (profile) và `users.service.ts:142` (search user) lọc `banned_at`. Không lọc ở: `feed.service.ts:49-53`, `posts.service.ts:178-195` (findAll), `:225-251` (explore), `:301-312` (trending), `:270-281` (querySearch), `search.service.ts:108-121` (FTS) + Meili path, `posts.service.ts:202-211` (findOne), comments, và `tracker.service.ts:15-21` (`/r/:postId` redirect vẫn ghi click + tăng `total_clicks` của user bị ban).
- Impact: trên nền tảng review/affiliate, "ban scammer" mà link scam vẫn live + vẫn ra tiền. Moderation vô hiệu với lý do ban phổ biến nhất (SCAM).
- Fix: thêm `user: { bannedAt: null }` vào mọi `post.findMany` public; raw SQL thêm `AND u.banned_at IS NULL` (đã JOIN users sẵn); tracker: `select: { user: { select: { bannedAt: true } } }` → 404 nếu banned; MV trending không cần đổi (JOIN users lúc đọc — thêm điều kiện ở `queryTrending`); Meili: xoá doc khi ban / filter khi load (`loadPostsByIds` thêm where). Invalidate cache explore/trending khi ban.

### H4 (ngoài phạm vi DB, phát hiện khi đọc auth) — OAuth auto-link theo email → pre-account-takeover
- Evidence: `auth.service.ts:205-226` `findFirst({ OR: [{googleId}, {email}] })` → nếu tài khoản email/password tồn tại mà chưa có googleId thì link + `emailVerified: true` (`:224`), KHÔNG xoá `passwordHash`, không bump `tokenVersion`, không xoá sessions. Facebook tương tự `:258`.
- Kịch bản: attacker đăng ký trước bằng email nạn nhân + mật khẩu của attacker (chưa verify) → nạn nhân sau đó "Login with Google" → tài khoản được link + đánh dấu verified → attacker vẫn đăng nhập bằng password và còn session cũ.
- Fix: khi link vào account `emailVerified=false`: xoá `passwordHash`, `tokenVersion++`, `session.deleteMany({userId})` (hoặc từ chối link, yêu cầu login bằng password trước).

## Medium

### M1. Index notifications không khớp query (prior M3 — STILL OPEN)
- Evidence: `notifications.service.ts:216-223` `WHERE recipient_id=? ORDER BY id DESC LIMIT 31`; index chỉ `(recipient_id, read)` (schema.prisma:246). EXPLAIN:
  ```
  Limit -> Sort (id DESC) -> Bitmap Heap Scan notifications -> Bitmap Index Scan notifications_recipient_id_read_idx
  ```
  → đọc + sort TOÀN BỘ notification của user mỗi trang.
- Fix: `@@index([recipientId, id(sort: Desc)])` thay `(recipientId, read)`; unread count dùng partial index (raw SQL migration): `CREATE INDEX notifications_unread_idx ON notifications(recipient_id) WHERE NOT read;`.

### M2. Index thừa (prefix) vẫn tồn tại + planner chọn nhầm chúng (prior M1 — STILL OPEN)
- Evidence (pg_stat_user_indexes prod): `follows_follower_id_idx` (prefix của PK `(follower_id, following_id)`), `comments_post_id_idx` (prefix của `(post_id, parent_id)`), `click_logs_post_id_idx` (prefix của `(post_id, ip, created_at)`).
  EXPLAIN dedup click (`tracker.service.ts:36-45`): `Index Scan using click_logs_post_id_idx … Filter: ip AND created_at` — dùng index thừa thay vì composite dedup.
- Fix: migration `DROP INDEX follows_follower_id_idx, comments_post_id_idx, click_logs_post_id_idx;` (xoá `@@index([followerId])`, `@@index([postId])` tương ứng trong schema). Giảm write amplification trên đúng 3 bảng insert-heavy.

### M3. Query pattern thiếu composite index: lọc category và comment top-level
- Evidence:
  - `posts.service.ts:179,186-195` `WHERE category_id=? ORDER BY id DESC` (và `like_count DESC, id DESC`) → EXPLAIN: `Sort <- Bitmap Heap Scan posts_category_id_idx` (sort toàn bộ bài của category mỗi trang).
  - `social.service.ts:308-312` `WHERE post_id=? AND parent_id IS NULL ORDER BY id DESC` → `Sort <- Index Scan comments_post_id_idx Filter parent_id IS NULL`. Replies `:350-354` `(post_id, parent_id=?) ORDER BY id ASC` cùng vấn đề.
  - Fanout `notification.processor.ts:35-41` `WHERE following_id=? AND follower_id > cursor ORDER BY follower_id` chỉ có `follows_following_id_idx(following_id)` → mỗi trang 1000 phải lọc+sort toàn bộ follower (O(N²/1000) với tác giả 100k follower).
- Fix:
  - `@@index([categoryId, id(sort: Desc)])` thay `@@index([categoryId])`. (Chỉ thêm `(categoryId, likeCount desc, id desc)` nếu sortBy+category thực sự dùng.)
  - `@@index([postId, parentId, id])` thay `@@index([postId, parentId])` (btree hỗ trợ `IS NULL` trong index cond, quét ngược cho DESC). Giữ `comments_parent_id_idx` cho nested include `parent_id IN (…)` + FK cascade.
  - `@@index([followingId, followerId])` thay `@@index([followingId])`.

### M4. Không có timeout ở DB/pool + không có quan sát query
- Evidence: `pg_settings`: `statement_timeout=0`, `idle_in_transaction_session_timeout=0`, `lock_timeout=0`, `log_min_duration_statement=-1`, `shared_preload_libraries=''` (không pg_stat_statements); pgbouncer.ini không có `query_timeout`. Tuning mặc định: `shared_buffers=128MB`, `work_mem=4MB` (prior INFRA-M3 — STILL OPEN).
- Impact: 1 query treo/interactive tx bị bỏ dở giữ 1 trong 25 server connection vô hạn; không có dữ liệu slow-query để tối ưu thật (audit này phải dựa EXPLAIN không thống kê).
- Fix: `ALTER ROLE <app> SET statement_timeout='10s'; ALTER ROLE <app> SET idle_in_transaction_session_timeout='30s';` (REFRESH MV / retention dùng `SET LOCAL statement_timeout` trong tx riêng hoặc role riêng); `log_min_duration_statement=500ms`; bật `pg_stat_statements` qua `command: postgres -c shared_preload_libraries=pg_stat_statements …` trong compose.

### M5. Backup: chạy đều + hợp lệ, nhưng cùng đĩa, không PITR, file world-readable, chưa diễn tập restore (prior INFRA-M2 — STILL OPEN)
- Evidence (2026-10-06 14:17 UTC):
  - `SCHEDULE: "@daily"` (`docker-compose.yml:89`), keep 7d/4w/6m. Log: `2026/10/06 00:00:00 … SQL backup created successfully`.
  - `backups/daily/` có 8 file 2026-09-29…2026-10-06, mỗi file ~17.3 KB; `gzip -t` OK; dump chứa 10 lệnh `COPY public.*` (users, posts, likes…), `pg_dump 16.10` từ server 16.13. Manual `pre-deploy-983a01e-20261006-2054.dump` (PGDMP, 47 KB).
  - Daily mới nhất (00:00 UTC) **trước** 12 migration hôm nay → schema cũ (`likes`); restore cần migrate lại (CMD tự chạy `migrate deploy` — OK nhưng lưu ý).
  - Quyền: `root 644` (daily), `664` (manual) → mọi user trên host đọc được email + bcrypt hash.
  - Cùng đĩa `/dev/nvme0n1p2` dùng 87% (237G trống); `archive_mode=off` → RPO tối đa 24h, không PITR.
- Fix: `chmod 700 backups/`, đặt `umask`/chown cho manual dump; sync offsite (rclone → R2 đã có sẵn credentials, bucket riêng, mã hoá); job restore-drill hàng tháng (`pg_restore` vào container tạm + `SELECT count(*)` các bảng chính); cân nhắc WAL archiving (wal-g) khi có user thật.

### M6. `DELETE /users/me` = hard cascade 1 transaction, không re-auth, counter người khác lệch tới 3AM (prior H4 — STILL OPEN, nay đã có endpoint)
- Evidence: `users.controller.ts:42-50` → `users.service.ts:149-154` `prisma.user.delete`. FK prod: mọi bảng con `ON DELETE CASCADE` (19 FK, chỉ `posts.category_id` SET NULL). Không yêu cầu mật khẩu/xác nhận; không sync Meili delete các post; `followers_count` của người họ follow, `like_count`/`comment_count` của post họ react/comment sai tới cron 3AM (`reconciliation.service.ts:25`); xoá luôn notifications nơi họ là actor, reports họ đã gửi (mất bằng chứng moderation).
- Fix: yêu cầu re-auth (password hoặc OAuth fresh); trong 1 tx: decrement counters bị ảnh hưởng bằng UPDATE set-based trước khi DELETE (hoặc gọi reconcile cho các id bị ảnh hưởng); enqueue Meili delete theo `post.id` của user; cân nhắc soft-delete (`deleted_at` + purge batch) khi dữ liệu lớn. Reports: đổi `reports.reporter_id` sang `ON DELETE SET NULL` (cột nullable) để giữ lịch sử.

### M7. Email unique phân biệt hoa/thường, không normalize
- Evidence: schema.prisma:54 `email String @unique` (TEXT, btree thường); `register.dto.ts` chỉ `@IsEmail()`, không lowercase; `auth.service.ts:155,187,205` so khớp exact. Prod hiện sạch: `SELECT count(*) FROM (SELECT lower(email) FROM users GROUP BY 1 HAVING count(*)>1) x;` → 0; `mixed_case_emails` → 0.
- Impact: `Foo@x.com` và `foo@x.com` thành 2 tài khoản; login sai case → "sai mật khẩu"; OAuth (email lowercase) không tìm thấy account đăng ký bằng chữ hoa → tạo account trùng.
- Fix: `@Transform(({value}) => value?.trim().toLowerCase())` ở mọi DTO có email (register/login/forgot/resend) + OAuth profile; migration `CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));` (dữ liệu hiện tại đã an toàn để tạo).

### M8. Retention notifications/sessions vẫn 1 statement (prior DATA-M4 — PARTIAL)
- Evidence: click_logs đã batch (`retention.service.ts:94-109`), nhưng `notification.deleteMany` `:78-85` và `session.deleteMany` `:86-88` là 1 DELETE. Notifications là bảng fanout lớn nhất; lần sweep đầu sau backlog = 1 tx khổng lồ (lock + WAL + giữ 1 pooled connection). EXPLAIN của predicate: BitmapOr 2 lần trên `notifications_created_at_idx` (OK).
- Fix: dùng cùng helper batch `DELETE … WHERE id IN (SELECT id … LIMIT 10000)` cho notifications; sessions nhỏ có thể giữ nguyên.

### M9. Moderation trên prod không vận hành được: 0 admin; report của target đã xoá không tự resolve (prior M5 — STILL OPEN)
- Evidence: `SELECT count(*) FILTER (WHERE is_admin) FROM users;` → 0. Prod `.env` không có `ADMIN_BOOTSTRAP_USERNAME`; trong container `bootstrap_env_empty`. `admin.service.ts:53-63` xoá post/comment không `report.updateMany` theo target; `reports.service.ts:52-58` không hydrate target.
- Fix: set `ADMIN_BOOTSTRAP_USERNAME` trên prod; trong `deletePost/deleteComment/ban` thêm `report.updateMany({ where: { targetType, targetId, status: 'PENDING' }, data: { status: 'RESOLVED', resolvedBy } })`.

### M10. Thống kê planner thiếu sau migration/restart
- Evidence: `pg_class.reltuples = -1` (chưa từng ANALYZE) cho notifications, sessions, bookmarks, blocks, reports, scraped_products, admin_audit_logs, trending_posts_mv; follows/click_logs không có `pg_stats`. `last_analyze`/`last_autoanalyze` NULL mọi bảng. Hệ quả thấy ngay ở EXPLAIN (chọn `click_logs_post_id_idx`, quét `follows_pkey` theo range follower_id).
- Fix: thêm `ANALYZE;` vào bước deploy sau `prisma migrate deploy` (hoặc 1 lần tay ngay bây giờ — thao tác ghi catalog, không làm trong audit này). Bảng nhỏ ít ghi sẽ không bao giờ chạm ngưỡng autoanalyze (50 rows + 10%).

### M11. Nested `take` của replies có thể load toàn bộ replies (cần xác minh bằng query log)
- Evidence: `social.service.ts:315-321` `include.replies { take: 10 }` trong khi generator không bật `relationJoins` (schema.prisma:1-3). Với relationLoadStrategy mặc định `query`, Prisma 6 lấy children bằng `WHERE parent_id IN (…) ORDER BY id` (EXPLAIN Q16: không LIMIT) rồi cắt per-parent trong bộ nhớ.
- Impact: 1 comment viral 10k replies → mỗi lần mở trang comment tải 10k rows.
- Fix: bật `DEBUG=prisma:query` 1 lần để xác nhận; nếu đúng: bỏ nested replies, load preview bằng 1 raw query `ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY id) <= 10`, hoặc `relationLoadStrategy: 'join'` (preview `relationJoins`, dùng LATERAL … LIMIT).

## Low

| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| L1 | Không có CHECK constraint nào cho invariant | `pg_constraint contype='c'` chỉ có 2 domain của information_schema. Prod sạch: 0 counter âm, 0 self-follow, 0 self-block, 0 reply sai post, 0 reply depth>1 | `CHECK (like_count>=0 AND comment_count>=0 AND click_count>=0 AND share_count>=0)`, users tương tự; `CHECK (follower_id<>following_id)`, `CHECK (blocker_id<>blocked_id)` (raw migration, `NOT VALID` rồi `VALIDATE`) |
| L2 | `@updatedAt` bị bump bởi mọi counter increment (Prisma client set khi `update`) → `sitemap.ts:15` lastModified churn theo like/click/share; ngược lại raw UPDATE (reconcile) không bump | `tracker.service.ts:57-60`, `social.service.ts:189,207,393`; `apps/frontend/src/app/sitemap.ts:15` | Thêm cột `edited_at` chỉ set ở `posts.update` nội dung; sitemap dùng nó |
| L3 | `timestamp(3) without time zone` mọi bảng; raw SQL so với `NOW()` phụ thuộc session TZ (prod `UTC` — OK). `stats.service.ts:35` `DATE(cl.created_at)` bucket theo UTC → click 00:00–07:00 giờ VN rơi sang ngày trước | `pg_attribute` query; `SHOW timezone` = UTC | Chart: `DATE(cl.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')`. Đừng đổi `TimeZone` server |
| L4 | Enum `MENTION` không dùng ở backend; reaction notif luôn type `LIKE` dù LOVE/HAHA… | grep: chỉ `queue.constants.ts:39`, frontend i18n | Giữ (ADD VALUE không gỡ được dễ); document |
| L5 | Index không phục vụ query nào: `scraped_products_scraped_at_idx` (code chỉ tra theo `product_url`), `admin_audit_logs_created_at_idx` (`listAudit` order theo `id`), `admin_audit_logs_actor_id_created_at_idx` (không query theo actor). `scraped_products` không có retention (24/24 rows đã stale >24h) | grep `scrapedAt`; `admin.service.ts:39-45` | Drop 3 index hoặc thêm retention `scraped_products` dùng index scraped_at |
| L6 | `GET /search?page=` không clamp: `Number('abc')`→NaN, `page=0`→`OFFSET -20` → lỗi PG → 500; page lớn → OFFSET sâu | `search.controller.ts:17`, `search.service.ts:107,120` | Dùng `parsePageParams` như feed (`feed.controller.ts:20`) với max page |
| L7 | Unfollow race: 2 request song song → `follow.delete` thứ 2 P2025 → 500 (prior L2 — STILL OPEN) | `social.service.ts:84-101` không catch P2025 | Bọc `isNotFound(e)` → `{following:false}` như reaction toggle `:209-211` |
| L8 | Reconcile chạy trên mọi instance khi Redis lỗi (prior M4 — STILL OPEN, chấp nhận khi single instance) | `reconciliation.service.ts:34-36` | Skip khi lock check lỗi |
| L9 | `click_count`/`total_clicks`/`share_count` không reconcile được; prod lệch do seed | `posts.click_count` vs `click_logs`: 39/40 post lệch, tổng 12202; `users.total_clicks` vs `SUM(posts.click_count)`: 10/15 user lệch, tổng 5237. like/comment/followers/following: 0 lệch | Nếu prod chỉ là seed: reset counter = số thật trước launch. Quyết định `total_clicks` là lifetime (giữ khi xoá post) hay sum hiện tại |
| L10 | Object không model được (GIN FTS, trgm, partial unique NEW_POST, MV, `pg_trgm`) vô hình với drift gate CI; script `db:push` tồn tại; index tạo không `CONCURRENTLY` | `ci.yml:91`; `packages/database/package.json:12`; migrations `20260716*` | CI assert tồn tại 3 index + MV qua `pg_indexes`/`pg_matviews`; xoá `db:push`; migration index mới trên bảng lớn dùng `CREATE INDEX CONCURRENTLY` (file riêng) |
| L11 | `edoburu/pgbouncer:latest` không pin | `docker-compose.yml:47`; image tạo 3 tháng trước, chạy 1.25.2 | Pin tag/digest |
| L12 | Counter update trên `posts` là non-HOT (cột `like_count`/`click_count` nằm trong index) → mỗi click/like ghi lại 8 index gồm GIN FTS | `pg_stat_user_indexes` posts: 8 index | Chấp nhận ở scale hiện tại; khi click >~100/s: tách `post_stats(post_id, …)` hoặc bỏ index keyset ít dùng |
| L13 | Trending/Explore rỗng trên prod: không có post nào trong 30 ngày | `posts.created_at` max 2026-06-29; `trending_posts_mv` 0 rows (populated=t, có `share_count`) | Hành vi đúng thiết kế; cân nhắc fallback "mới nhất" khi rỗng |

## Schema design — tóm tắt đánh giá (mục 1)
- Normalization: 3NF; denormalized có chủ đích (`posts.like/comment/click/share_count`, `users.followers/following_count`, `users.total_clicks`). MV trending sao chép cả row post (gồm `content`) — ok, refresh 5′.
- FK/onDelete: 19 FK, tất cả CASCADE trừ `posts.category_id SET NULL`. `reports.target_id`, `reports.resolved_by`, `admin_audit_logs.*` polymorphic không FK (chủ đích). Prod: 0 report dangling, 0 resolved_by dangling.
- Unique: reactions PK `(user_id, post_id)` (1 reaction/user/post), bookmarks PK, follows PK, blocks PK, reports `(reporter, type, target)`, notifications partial unique NEW_POST — tất cả có trên prod.
- Counter consistency: atomic increment trong `$transaction` + reconcile đêm (like/comment/follow) — prod 0 lệch cho 4 counter này.
- Enums: 5 enum, khớp prod; `MENTION` dead.
- Soft delete/ban: không soft delete; ban = `banned_at` + `token_version++` (auth OK) nhưng nội dung không bị ẩn (H3).
- Timestamps: `timestamp(3)` không TZ (L3); `updated_at` chỉ set phía Prisma (L2).
- ID types: Int SERIAL cho entity (đủ), BIGINT column cho 2 bảng log nhưng sequence int4 (H1), `sessions.id` cuid TEXT.

## Migration hygiene (mục 3)
- 18/18 applied, không `rolled_back_at`, `logs` rỗng.
- Drift: `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` (chạy trong container backend) → `-- This is an empty migration.` EXIT=0 → **không drift** với phần Prisma model được. Object raw (3 index + MV) xác nhận tồn tại bằng `pg_indexes`/`pg_matviews`.
- Naming: `YYYYMMDDHHMMSS_snake_case` nhất quán, mô tả rõ.
- Bước phá huỷ/khoá: `DROP MATERIALIZED VIEW` (dữ liệu dẫn xuất — an toàn); `DROP INDEX posts_user_id_idx` + tạo thay thế cùng file; `ALTER COLUMN TYPE BIGINT` (rewrite + ACCESS EXCLUSIVE — rẻ khi nhỏ, nhưng không đủ, H1); `UPDATE users SET token_version = 1` (đăng xuất toàn bộ — đã xảy ra trên prod hôm nay 13:58 UTC, 15/15 user `token_version=1`); likes→reactions rename giữ dữ liệu (87 rows LIKE).
- Migrate chạy lúc container start (`Dockerfile` CMD) không có bước ANALYZE/rollback (M10, prior INFRA-M1 — STILL OPEN).

## pgBouncer (mục 5)
- `DATABASE_URL …@pgbouncer:6432/shopee_review?pgbouncer=true&connection_limit=15` (prod, đã che credentials) — Prisma tắt prepared statements; pgbouncer `pool_mode=transaction`, `max_prepared_statements=0`, `default_pool_size=25 ≥ 15`, `max_client_conn=100`; PG `max_connections=100`. `pg_prepared_statements` = 0. OK.
- Interactive tx (`blocks.service.ts:22`, `social.service.ts:441`) tương thích transaction mode (cả tx trên 1 server conn), ngắn. Không dùng advisory lock/`SET` session/LISTEN. `REFRESH MATERIALIZED VIEW CONCURRENTLY` giữ 1 conn trong lúc chạy — đã tính trong pool.
- Migrations qua `DIRECT_URL` (db:5432) — đúng (advisory lock của migrate cần session).
- Thiếu `query_timeout`/statement_timeout (M4). Image không pin (L11).

## Đối chiếu report trước

| Report | ID | Trạng thái | Evidence |
|--------|----|-----------|----------|
| schema-review 260709 | C1 cursor tie-breaker + index | FIXED | `posts.service.ts:185-187`; `posts_like_count_id_idx`, `posts_click_count_id_idx` trên prod. (Lọc category vẫn thiếu → M3) |
| | H1 ILIKE search | FIXED | `posts.service.ts:175-177,264-289` FTS GIN; EXPLAIN dùng `posts_search_idx` |
| | H2 retention | FIXED (notif chưa batch → M8) | `retention.service.ts` |
| | H3 BIGINT PK | **PARTIAL / KHÔNG HIỆU LỰC** | column bigint nhưng sequence integer → H1 |
| | H4 hard cascade user delete | STILL OPEN (endpoint đã ship) | M6 |
| | M1 index thừa | STILL OPEN | M2 |
| | M2 MV share_count | FIXED | `pg_get_viewdef` có `share_count` |
| | M3 notifications index | STILL OPEN | M1 |
| | M4 reconcile khi Redis lỗi | STILL OPEN (chấp nhận) | L8 |
| | M5 reports dangling/hydrate | STILL OPEN | M9 |
| | M6 deleteCommentCore race | FIXED | `social.service.ts:441-450` DELETE 1 statement trong tx |
| | L2 FTS `simple` không bỏ dấu | STILL OPEN (chấp nhận, fallback) | — |
| | L3 pgBouncer sạch | VẪN ĐÚNG | mục 5 |
| | L4/L5 seed counter, không reconcile click/share | STILL OPEN | L9 |
| full-stack 260716 | INFRA-C1 Postgres public + password hardcode | PARTIAL: port FIXED (`127.0.0.1:65432`), password STILL OPEN (prod dùng default) + superuser | H2 |
| | DATA-C1 connection_limit=1 | FIXED | `connection_limit=15` |
| | DATA-H1 graceful shutdown | FIXED | `main.ts:75` `enableShutdownHooks()`; CMD `exec node` |
| | DATA-H2 feed Redis degrade | FIXED | `feed.service.ts:26-42` |
| | DATA-M1 fanout idempotent | FIXED | `notifications_new_post_uniq` partial unique trên prod; `createMany skipDuplicates` → `ON CONFLICT DO NOTHING` |
| | DATA-M2 Meili drift | FIXED (có recovery tay) | `search.controller.ts:21-25` `POST /search/reindex` (Admin) — nhưng prod 0 admin (M9) |
| | DATA-M3 commentCount race | FIXED | như trên |
| | DATA-M4 retention không batch | PARTIAL | M8 |
| | DATA-M5 getPostStats unbounded | FIXED | `stats.service.ts:28` `take: 500` |
| | DATA-M6 searchUsers ILIKE | FIXED | `users_search_trgm_idx`; EXPLAIN dùng index |
| | SECURITY-M1 feed limit | FIXED | `feed.controller.ts:20` |
| | L6 bài của user bị ban vẫn hiện | STILL OPEN → nâng High | H3 |
| | L2 double-unfollow P2025 | STILL OPEN | L7 |
| | INFRA-M1 migrate-on-start | STILL OPEN | mục 3 |
| | INFRA-M2 backup cùng đĩa/no PITR | STILL OPEN | M5 |
| | INFRA-M3 PG tuning | STILL OPEN | M4 |

## Recommended Actions (thứ tự)
1. Migration: `ALTER SEQUENCE click_logs_id_seq AS bigint; ALTER SEQUENCE notifications_id_seq AS bigint;` + CI assert (H1).
2. Đổi mật khẩu DB prod + role app non-superuser; compose `:?required` (H2).
3. Lọc `banned_at IS NULL` ở mọi read path public + tracker (H3); fix OAuth link (H4).
4. 1 migration index: notifications `(recipient_id, id DESC)` + partial unread; drop 3 index prefix; `posts(category_id, id DESC)`; `comments(post_id, parent_id, id)`; `follows(following_id, follower_id)` (M1-M3). Sau deploy chạy `ANALYZE` (M10).
5. statement/idle timeouts + pg_stat_statements (M4).
6. Backup: chmod, offsite R2, restore drill (M5).
7. Email lowercase + unique `lower(email)` (M7); batch retention notifications (M8); set `ADMIN_BOOTSTRAP_USERNAME` + auto-resolve reports (M9); re-auth + counter fix cho delete account (M6).

## Metrics
- Type coverage / test coverage: không đo trong audit DB này.
- Prod: DB 9999 kB; 54 index (tất cả `indisvalid`); 0 counter lệch cho like/comment/followers/following; 0 orphan polymorphic.

## SQL đã chạy (prod, tất cả bọc `BEGIN TRANSACTION READ ONLY; … ROLLBACK;`)
Runner: `{ echo "BEGIN TRANSACTION READ ONLY;"; cat q.sql; echo "ROLLBACK;"; } | ssh homelab 'cd ~/working-sources/shopee.review && docker compose exec -T db sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -X -P pager=off"'`

```sql
-- q1: version/settings
SELECT version();
SELECT current_setting('server_version'), pg_postmaster_start_time(), now();
SELECT stats_reset FROM pg_stat_database WHERE datname=current_database();
SELECT name, setting, unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size','maintenance_work_mem','random_page_cost','statement_timeout','idle_in_transaction_session_timeout','lock_timeout','log_min_duration_statement','track_io_timing','autovacuum','wal_level','archive_mode','max_wal_size','checkpoint_timeout','shared_preload_libraries','default_transaction_read_only');
SELECT extname, extversion FROM pg_extension;
SELECT pg_size_pretty(pg_database_size(current_database()));

-- q2: table stats + counts
SELECT relname, n_live_tup, n_dead_tup, seq_scan, seq_tup_read, idx_scan, n_tup_ins, n_tup_upd, n_tup_del, last_autovacuum, last_autoanalyze, last_analyze,
  pg_size_pretty(pg_total_relation_size(relid)), pg_size_pretty(pg_indexes_size(relid))
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;
SELECT 'users', count(*) FROM users UNION ALL SELECT 'posts', count(*) FROM posts /* … mọi bảng + trending_posts_mv */;

-- q3: migrations + data age + MV
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, left(coalesce(logs,''),80) FROM _prisma_migrations ORDER BY started_at;
SELECT min(created_at), max(created_at), count(*) FILTER (WHERE created_at > now()-interval '30 days') FROM posts;
SELECT min(created_at), max(created_at) FROM users;
SELECT ispopulated FROM pg_matviews WHERE matviewname='trending_posts_mv';
SELECT pg_get_viewdef('trending_posts_mv'::regclass) LIKE '%share_count%';

-- q4: indexes / FKs / checks / column types
SELECT s.relname, s.indexrelname, s.idx_scan, pg_size_pretty(pg_relation_size(s.indexrelid)), i.indisvalid, i.indisunique
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid=s.indexrelid ORDER BY 1,2;
SELECT indexdef FROM pg_indexes WHERE indexname IN ('posts_search_idx','users_search_trgm_idx','notifications_new_post_uniq');
SELECT conrelid::regclass, conname, confdeltype, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' ORDER BY 1,2;
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c';
SELECT a.attrelid::regclass, a.attname, format_type(a.atttypid,a.atttypmod) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND a.attname IN ('id','created_at','updated_at','email') AND NOT a.attisdropped ORDER BY 1,2;

-- q5: integrity (aggregate only)
SHOW timezone;
SELECT 'posts.like_count', count(*) FILTER (WHERE p.like_count <> coalesce(r.cnt,0)), sum(abs(p.like_count - coalesce(r.cnt,0))), count(*)
FROM posts p LEFT JOIN (SELECT post_id, count(*) cnt FROM reactions GROUP BY 1) r ON r.post_id=p.id;
-- (tương tự: comment_count vs comments; click_count vs click_logs; followers_count/following_count vs follows; total_clicks vs SUM(posts.click_count))
SELECT count(*) FILTER (WHERE like_count<0 OR comment_count<0 OR click_count<0 OR share_count<0) FROM posts;
SELECT count(*) FILTER (WHERE followers_count<0 OR following_count<0 OR total_clicks<0) FROM users;
SELECT count(*) FROM follows WHERE follower_id=following_id;
SELECT count(*) FROM blocks WHERE blocker_id=blocked_id;
SELECT count(*) FROM comments c JOIN comments p ON p.id=c.parent_id WHERE p.post_id<>c.post_id;
SELECT count(*) FROM comments c JOIN comments p ON p.id=c.parent_id WHERE p.parent_id IS NOT NULL;
SELECT count(*) FROM (SELECT lower(email) FROM users GROUP BY 1 HAVING count(*)>1) x;
SELECT count(*) FILTER (WHERE email<>lower(email)), count(*) FILTER (WHERE username<>lower(username)) FROM users;
SELECT count(*) FROM (SELECT lower(username) FROM users GROUP BY 1 HAVING count(*)>1) x;
SELECT count(*) FILTER (WHERE target_type='POST' AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id=r.target_id))
     + count(*) FILTER (WHERE target_type='COMMENT' AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id=r.target_id))
     + count(*) FILTER (WHERE target_type='USER' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.target_id)) FROM reports r;
SELECT count(*) FROM reports r WHERE resolved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.resolved_by);
SELECT count(*) FILTER (WHERE banned_at IS NOT NULL), count(*) FILTER (WHERE is_admin), count(*) FILTER (WHERE verified),
       count(*) FILTER (WHERE NOT email_verified), count(*) FILTER (WHERE password_hash IS NULL),
       count(*) FILTER (WHERE verify_token IS NOT NULL AND (verify_token_exp IS NULL OR verify_token_exp < now())),
       count(*) FILTER (WHERE reset_token IS NOT NULL AND reset_token_exp < now()),
       count(*) FILTER (WHERE token_version=0), count(*) FILTER (WHERE token_version=1) FROM users;
SELECT count(*) FROM posts p JOIN users u ON u.id=p.user_id WHERE u.banned_at IS NOT NULL;
SELECT count(*) FILTER (WHERE category_id IS NULL), count(*) FILTER (WHERE product_meta IS NULL), count(*) FILTER (WHERE images IS NULL) FROM posts;
SELECT count(*) FROM scraped_products WHERE scraped_at < now()-interval '24 hours';
SELECT type, count(*) FROM reactions GROUP BY 1;

-- q6: EXPLAIN (COSTS OFF), SET LOCAL enable_seqscan=off (bảng quá nhỏ, ép planner lộ index khả dụng)
-- feed semi-join, posts category (id / like_count), notifications list + unread, FTS fallback, users trgm (3 & 2 ký tự),
-- comments top-level, blocks OR, click dedup, stats chart, explore, followers list, fanout page, retention notif predicate,
-- sessions list, nested replies IN, bookmarks, user posts hasProduct, getPostStats. Ví dụ:
EXPLAIN (COSTS OFF) SELECT * FROM notifications WHERE recipient_id=1 ORDER BY id DESC LIMIT 31;
EXPLAIN (COSTS OFF) SELECT * FROM posts WHERE category_id=1 ORDER BY id DESC LIMIT 21;
EXPLAIN (COSTS OFF) SELECT * FROM comments WHERE post_id=1 AND parent_id IS NULL ORDER BY id DESC LIMIT 21;
EXPLAIN (COSTS OFF) SELECT id FROM click_logs WHERE post_id=1 AND ip='1.2.3.4' AND created_at >= now()-interval '1 hour' LIMIT 1;
EXPLAIN (COSTS OFF) SELECT follower_id FROM follows WHERE following_id=1 AND follower_id > 100 ORDER BY follower_id LIMIT 1000;
EXPLAIN (COSTS OFF) SELECT * FROM comments WHERE parent_id IN (1,2,3) ORDER BY id ASC;

-- q7: planner stats / connections / role
SELECT c.relname, c.reltuples, c.relpages, (SELECT count(DISTINCT attname) FROM pg_stats s WHERE s.tablename=c.relname)
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','m') ORDER BY 1;
SELECT usename, application_name, client_addr, state, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2,3,4;
SELECT count(*) FROM pg_prepared_statements;
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname=current_user;

-- q8: sequences + enums
SELECT schemaname, sequencename, data_type, max_value, last_value FROM pg_sequences ORDER BY 2;
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY 1;
```
Lệnh ngoài SQL (read-only): `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` (container backend); `ls/stat/gzip -t/zcat | grep -c '^COPY'` trên `backups/`; `docker compose logs db-backup`; `docker compose config` (chỉ so sánh password với default, không in); pgbouncer.ini (đã lọc dòng chứa password).

## Unresolved Questions
1. Dữ liệu prod (15 user, 40 post, tất cả tháng 6) là seed hay user thật? Quyết định có reset counter click (L9) và mức ưu tiên backup offsite.
2. Ban có ý định ẩn toàn bộ nội dung + chặn redirect affiliate không (H3)? Report trước đã hỏi, chưa có câu trả lời — audit này giả định CÓ.
3. `total_clicks` là lifetime (giữ khi xoá post) hay phải bằng tổng click các post hiện có?
4. Xoá tài khoản: muốn giữ reports/notifications người khác (SET NULL/anonymize) hay xoá sạch theo GDPR?
5. Prod `.dockerignore` đang có thay đổi chưa commit (`git status` trên homelab: ` M .dockerignore`) — có chủ đích không?
6. Ai đang query `"Post"`/`"User"` (tên bảng sai) lúc 14:17:30 UTC (log db: `relation "Post" does not exist`)? Không phải từ app — có thể agent/công cụ khác.

---
Status: DONE_WITH_CONCERNS
Summary: Schema và phần lớn finding cũ đã được sửa, không drift Prisma, backup chạy đều và hợp lệ; nhưng migration BIGINT không hiệu lực (sequence vẫn int4), app dùng superuser với mật khẩu dev công khai, và ban không ẩn nội dung/affiliate link.
Top 5: (1) H1 sequence int4 sau BIGINT migration; (2) H2 superuser + default password trên prod; (3) H3 nội dung/redirect của user bị ban vẫn live; (4) H4 OAuth auto-link pre-account-takeover; (5) M1–M3 index notifications/category/comments/fanout không khớp query + 3 index thừa.
