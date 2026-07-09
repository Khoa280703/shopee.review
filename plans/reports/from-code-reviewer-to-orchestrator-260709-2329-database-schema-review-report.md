# Data-Layer Review — shopee.review (Prisma 6 / PG16 / pgBouncer)

Scope: schema.prisma (272L), 10 migrations, reconciliation.service.ts, posts.service.ts, social.service.ts, tracker.service.ts, feed.service.ts, search.service.ts, notifications.service.ts, seed.ts.

## Critical

**C1. Cursor pagination hỏng khi `sortBy=likeCount|clickCount`** — `posts.service.ts:159-166` + `query-posts.dto.ts:27-28`.
`orderBy: { likeCount: 'desc' }` không có tie-breaker, cursor theo `id`. Prisma seek theo giá trị cursor row → hàng trùng likeCount bị skip/duplicate giữa các trang; đồng thời không có index trên `like_count`/`click_count` (schema.prisma:116-118 chỉ có userId/categoryId/createdAt) → sort toàn bảng mỗi request. Sửa: thêm tie-breaker `[{likeCount:'desc'},{id:'desc'}]` + index `(like_count DESC, id DESC)`, `(click_count DESC, id DESC)`. Khi nào: correctness bug — sửa NGAY; perf đau từ ~50k posts.

## High

**H1. `findAll` search dùng ILIKE `contains` — search path thứ 3 không index** — `posts.service.ts:152-157`. `%term%` insensitive không dùng được FTS GIN lẫn Meili → seq scan. Failure: 10k+ posts, mỗi search quét bảng. Sửa: route param `search` qua SearchService (Meili→FTS fallback) hoặc bỏ param; đừng thêm pg_trgm nếu đã có 2 đường search. Khi nào: 10k posts.

**H2. click_logs + notifications tăng vô hạn, không retention/partition** — schema.prisma:184-217. click_logs giữ IP/UA/referer (PII) mãi mãi; notifications NEW_POST fanout 1 row/follower (`notifications.service.ts:134-146`) — author 10k followers × 1 post = 10k rows. Failure @100k users: bảng chục–trăm triệu rows, vacuum/index bloat, backup phình. Sửa: (a) cron xóa click_logs > 90 ngày (counter đã denormalize, log thô chỉ cần cho dedup 1h + analytics ngắn hạn); (b) xóa notifications read > 90 ngày trong ReconciliationService; (c) partition theo tháng chỉ khi > ~50M rows — chưa cần bây giờ. Khi nào: cron TTL trước 10k users; partition cân nhắc ở 100k.

**H3. Int4 PK cho click_logs/notifications** — migration `20260621150117` (SERIAL), schema.prisma:185,202. Horizon: 1M clicks/ngày → cạn int4 ~5.8 năm; notifications fanout có thể nhanh hơn (10k authors lớn × posts × followers). Không bảng nào FK vào 2 id này → đổi BIGINT bây giờ = 1 migration rẻ (table rewrite khi còn nhỏ); đổi sau ở hàng trăm triệu rows = rewrite dài, lock. users/posts/comments giữ Int là đúng (không bao giờ chạm 2.1B ở scale này); reactions/bookmarks/follows/blocks dùng composite PK — không vấn đề. Khuyến nghị: BIGINT cho `click_logs.id` + `notifications.id` ngay; KHÔNG chuyển UUID (mất locality, phình index, không cần thiết). Khi nào: ngay (rẻ) hoặc muộn nhất 10k users nếu có TTL (TTL làm horizon dài ra nhưng sequence không reset — vẫn nên đổi).

**H4. User delete = hard cascade dây chuyền + counter sai tới 24h** — schema.prisma:108,127-128,142,172,210-211. Xóa 1 user cascade: posts → (click_logs, comments, reactions, bookmarks, notifications), follows 2 chiều, notifications nơi họ là ACTOR (xóa notification của người khác). 1 DELETE user quyền lực = hàng triệu rows trong 1 transaction (lock + WAL storm qua pgBouncer giữ connection lâu). Đồng thời followersCount/likeCount của người khác sai tới khi cron 3AM chạy (`reconciliation.service.ts:25`). Hiện chưa có endpoint xóa user (chỉ ban) — rủi ro tiềm ẩn cho GDPR delete sau này. Sửa hướng: khi làm user-deletion, dùng soft-delete + background purge theo batch. Khi nào: trước khi ship tính năng xóa tài khoản.

## Medium

**M1. Redundant indexes trên bảng ghi nóng** — `follows_follower_id_idx` (migration 20260625050253) là prefix của PK `(follower_id, following_id)`; `comments_post_id_idx` là prefix của `(post_id, parent_id)` (schema.prisma:177,180); `click_logs_post_id_idx` là prefix của `(post_id, ip, created_at)` (schema.prisma:194,197). 3 index thừa = write amplification trên đúng các bảng insert-heavy. Sửa: drop 3 index. Khi nào: tiện migration tới.

**M2. trending_posts_mv thiếu share_count và score bỏ qua share** — migration `20260625090918` tạo MV trước khi `share_count` tồn tại (migration 20260703015955 không recreate MV). `mapRawPostRow` (posts.service.ts:91) mask bằng `?? 0` → trending luôn hiển thị shareCount=0, và bài share nhiều không được boost. Refresh strategy thì ĐÚNG: CONCURRENTLY + unique index + Redis NX lock + TTL < interval (trending-refresh.service.ts:8-9,54). Staleness 5 phút chấp nhận được. Sửa: 1 migration DROP/CREATE MV thêm share_count vào cột + công thức. Khi nào: sớm, rẻ.

**M3. Notifications read-path index chưa khớp query** — `list()` lọc `recipientId` order `id DESC` (notifications.service.ts:189-194) nhưng index là `(recipient_id, read)` (schema.prisma:214) → PG dùng prefix rồi sort. Sửa: đổi thành `(recipient_id, id DESC)` + partial index `(recipient_id) WHERE read = false` cho `unreadCount`. Khi nào: 10k users / vài triệu notifications.

**M4. Reconciliation khi Redis lỗi chạy trên MỌI instance đồng thời** — `reconciliation.service.ts:34-36` catch rồi "proceed". N instance cùng chạy set-based UPDATE trên cùng rows → lock contention/deadlock tiềm ẩn (thứ tự row khác nhau giữa các UPDATE...FROM). Xác suất thấp, hậu quả tự retry đêm sau. Sửa: khi lock check fail → skip thay vì proceed, hoặc chấp nhận + ghi nhận. Khi nào: chỉ khi multi-instance.

**M5. Report polymorphic — dangling targets không dọn, admin UI N+1 tiềm ẩn** — schema.prisma:237 (không FK, chủ đích — OK). Nhưng post/comment bị xóa để lại report PENDING trỏ vào void; `reports.list()` (reports.service.ts:52-58) không hydrate target → admin UI phải fetch từng target (N+1 + 404). `resolvedBy` (schema.prisma:241) cũng không FK. Sửa: khi admin xóa post/comment, auto-resolve reports của target đó (`updateMany where targetType/targetId`); admin list hydrate target theo batch (3 query `IN`). Index `(target_type, target_id)` chưa cần vì list chỉ dùng `(status, created_at)` — thêm khi có trang "reports về X". Khi nào: trước khi admin UI dùng nhiều.

**M6. deleteCommentCore race làm drift commentCount** — social.service.ts:435-444: `count(replies)` rồi mới delete trong transaction khác thời điểm; reply chèn giữa 2 bước → decrement sai. Cron 3AM sửa lại (comments được reconcile, reconciliation.service.ts:69-77). Chấp nhận được — document, không cần fix.

## Low

**L1. Hot-row counters: KHÔNG cần sharded counter.** Increment atomic trong transaction ngắn 2-3 statement (social.service.ts:186-189, tracker.service.ts:48-65). PG chịu ~1-5k single-row update/s/row; viral post ở 100k users thực tế đạt chục/s. Điểm nóng thật duy nhất: `users.total_clicks` của author gộp click MỌI post của họ (tracker.service.ts:61-64) — vẫn xa giới hạn. Chỉ xem lại nếu > ~500 clicks/s vào 1 author. Không over-engineer.

**L2. FTS vs Meili: FTS giữ làm fallback là hợp lý, không dead weight** — search.service.ts:50-66 fallback rõ ràng; GIN index expression khớp chính xác query expression (migration 20260621151137 vs search.service.ts:103). Lệch nhỏ: `'simple'` config không bỏ dấu tiếng Việt → kết quả fallback kém hơn Meili — chấp nhận, đã là degraded mode. Lưu ý: Meili sync best-effort (posts.service.ts:131-133 swallow) → có thể lệch index; cân nhắc full re-index định kỳ.

**L3. pgBouncer transaction mode: sạch.** Không advisory lock PG (dùng Redis NX — đúng bài), không `SET`, `$transaction` đều dạng batch array ngắn, REFRESH MV là single statement. Duy nhất: REFRESH CONCURRENTLY giữ 1 server connection trong suốt thời gian chạy — tính vào pool size. Xác nhận `DATABASE_URL` có `pgbouncer=true` (schema.prisma:5-12 có directUrl đúng chuẩn).

**L4. seed.ts fix prisma.like→prisma.reaction (dòng 288-303): ĐÚNG** — upsert theo `userId_postId`, `type:'LIKE'` hợp lệ với schema. Nhưng seed đặt `likeCount: rand(5,200)`, `commentCount: rand(2,30)` (seed.ts:277-279) trong khi chỉ tạo 2-6 reactions/1-4 comments thật → cron reconciliation đêm đầu sẽ ghi đè counter về giá trị thật, seed data "xẹp". Vô hại prod, nhưng nên set counter = số row thật để giữ invariant.

**L5. Reconciliation không cover `share_count`/`click_count`/`total_clicks`** — share_count không có bảng nguồn (increment-only, social.service.ts:295-303) nên không thể reconcile — chấp nhận; click counters không thể recompute nếu áp dụng TTL click_logs (H2) — đúng là không nên reconcile. Document là đủ.

**L6. Migration hygiene likes→reactions: TỐT** — migration 20260703015955 rename table + PK + 2 FK constraint + swap index đầy đủ, backfill qua DEFAULT, không mất data. Không phát hiện drift với schema.prisma. Enum thêm value bằng `ALTER TYPE ADD VALUE` (20260625085219) đúng cách.

## Data-model readiness: 7/10

Nền tảng vững: composite PK cho junction tables, counter atomic + reconciliation cron, MV CONCURRENTLY + lock đúng, migration rename tay cẩn thận. Trừ điểm vì các bug/gap dưới.

Top 3 rủi ro cấu trúc:
1. **Append-only tables không có vòng đời** (click_logs PII + notifications fanout, int4 PK) — H2+H3: sẽ là vấn đề vận hành lớn nhất ở 100k users.
2. **Query path không scale ẩn sau cache** — C1 (cursor sai + không index), H1 (ILIKE), explore OFFSET sort toàn bộ 30-day window mỗi cache miss (posts.service.ts:204-224): cache 60s che được tới khi cardinality cache key (category×offset) phá hit rate.
3. **Hard cascade từ User + cửa sổ drift 24h** — H4: chặn đường làm account deletion an toàn.

Hành động đề xuất (thứ tự): 1) Fix C1 (tie-breaker + index). 2) Migration gộp: BIGINT 2 bảng log, drop 3 index thừa, recreate MV với share_count. 3) TTL cron cho click_logs/notifications. 4) Route search qua SearchService. 5) Auto-resolve reports khi xóa target.

---
Status: DONE_WITH_CONCERNS
Summary: Data model nền tảng tốt cho 100k users nhưng có 1 bug correctness ở cursor pagination (sortBy likeCount/clickCount), 2 bảng log không có retention + int4 PK, và search path ILIKE không index; tất cả sửa được rẻ nếu làm sớm.
Findings: Critical 1 | High 4 | Medium 6 | Low 6.
