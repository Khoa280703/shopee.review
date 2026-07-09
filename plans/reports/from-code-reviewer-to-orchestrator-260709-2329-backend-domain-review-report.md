# Backend Domain Review — posts/feed/social/notifications/search/queue/maintenance/stats

Scope: ~2.8k LOC domain layer + schema/migrations + test/social-engagement.spec.ts. Grading for trajectory 100k+ users, multi-instance.

## Critical

**C1. Public endpoints nhận `limit` không clamp → DoS không cần auth**
- `comments.controller.ts:24-31,38-46`: `limit ? Number(limit) : 20` truyền thẳng vào `take: limit + 1` (`social.service.ts:307-310`). `GET /posts/1/comments?limit=5000000` (KHÔNG cần login) → Prisma load hàng triệu row + include user + replies → OOM/DB saturation. nginx microcache không cứu (mỗi limit là URI khác nhau).
- Cùng lỗi: `feed.controller.ts:15-21` (authed nhưng vẫn unclamped), `notifications.controller.ts:25` / `bookmarks.controller.ts:18` (cursor NaN).
- Fix: DTO validate `@Max(50)` như `QueryPostsDto`; clamp trong service như `listFollowers` đã làm đúng (`social.service.ts:114`).

## High

**H1. ThrottlerModule config nhưng KHÔNG có global guard — spam vector toàn hệ**
- `app.module.ts:61` khai `ThrottlerModule.forRoot`, nhưng không có `APP_GUARD` (grep toàn src: chỉ `reactions.controller.ts:49-50` share endpoint dùng ThrottlerGuard). Comment/follow/react/search/explore không rate-limit → notification flood qua follow-unfollow-follow loop (mỗi follow tạo notification mới, `social.service.ts:67-71`, không dedup), comment spam.
- Fix: đăng ký `{ provide: APP_GUARD, useClass: ThrottlerGuard }` + override per-route.

**H2. Redis 512MB noeviction dùng chung cache+BullMQ+pubsub; cache.set/get không guard → cascade 500**
- `posts.service.ts:141-144`, `feed.service.ts:21-25`: `cache.get/set` await trực tiếp, không try/catch. Với `noeviction`, khi Redis đầy → mọi SET trả OOM error → toàn bộ /feed, /explore, /trending 500 dù DB khỏe.
- Nạp key không giới hạn bởi unauth user: `posts.controller.ts:8-12` explore `offset` chỉ `@Min(0)`, không Max → mỗi `explore:all:{offset}:{limit}` là 1 key ~vài chục KB TTL 60s, mint tự do.
- Fix: wrap cache ops try/catch (fail-open về DB); Max offset (vd 1000); tách cache DB (`SELECT 1`) hoặc chấp nhận eviction cho cache keyspace.

**H3. `findAll` cursor pagination hỏng với `sortBy=likeCount|clickCount` + search seq-scan**
- `posts.service.ts:159-166`: orderBy `likeCount desc` (không tiebreaker id) + cursor theo id → sort không total-order, likeCount đổi giữa 2 page → duplicate/mất bài, page nhảy loạn. Fix: `orderBy: [{likeCount:'desc'},{id:'desc'}]` và cursor semantics keyset 2 cột (hoặc offset cho sort này).
- `posts.service.ts:152-157`: `contains` → `ILIKE '%x%'` không dùng được GIN FTS index (`posts_search_idx` là tsvector) → seq scan toàn bảng posts mỗi request khi client gọi `?search=`. Fix: route qua SearchService/FTS hoặc pg_trgm index.

## Medium

**M1. Trending MV thiếu `share_count` — xác nhận thực, không chỉ là display bug**
- MV tạo ở `20260625090918` (migration.sql:11-33) trước khi `share_count` thêm vào posts (`20260703...:23`); MV chưa recreate. Hệ quả: (a) API trending luôn trả `shareCount: 0` (`posts.service.ts:91` fallback `?? 0`); (b) score MV (click*0.4+like*0.3+comment*0.3) bỏ qua share → share engagement không ảnh hưởng trending. Severity thực: Medium — sai product signal, không mất data. Fix: migration DROP/CREATE MV thêm `share_count` + hệ số score.

**M2. Explore: offset-pagination trên score biến thiên theo thời gian**
- `posts.service.ts:221-231`: `nextCursor = offset + limit`, mỗi page cache 60s riêng; score đổi giữa các lần fetch → page sau duplicate/skip bài của page trước. Chấp nhận được cho explore, nhưng nên keyset `(score, id)` khi làm feed chính.

**M3. `unfollow` race → 500 không xử lý (inconsistent với `react`)**
- `social.service.ts:83-100`: check-then-delete; 2 request đồng thời → delete thứ hai P2025 → transaction throw → 500. `react` đã catch `isNotFound` (dòng 203-210), unfollow thì không. Fix: catch P2025 → `{ following:false }`. Counter không hỏng (txn abort) nhưng UX double-click là 500.

**M4. Sync-fallback fanout không bound khi thiếu queue**
- `notifications.service.ts:129-146`: nếu `fanoutQueue` undefined (REDIS_URL unset) thì user ≥1000 followers rơi xuống inline path: `findMany` TOÀN BỘ followers không `take` + 1 lệnh `createMany` khổng lồ → block event loop/memory. Queue path (`notification.processor.ts:34-57`) phân trang 1000 đúng cách — 2 path phân kỳ. Fix: inline path cũng phân trang, hoặc hard-cap khi không có queue.
- Phụ: fanout KHÔNG `pushToStream` → NEW_POST không realtime (khác path `create()`), chấp nhận được nhưng nên ghi nhận.

**M5. `notifications.create` awaited sau commit → 500 sau khi write đã thành công**
- `social.service.ts:190-195` (react), `401-406` (addComment), `67-71` (follow): nếu notification insert/publish throw (không phải P2002) → client nhận 500 dù reaction/comment ĐÃ commit → client retry → double comment. Fix: fire-and-forget với catch+log (như `fanoutNewPost`).

**M6. Input số không validate → 500 từ PG/Prisma**
- `search.controller.ts:15`: `Number(page)` — `page=0|-1|abc` → `OFFSET -20`/NaN → PG error 500 (`search.service.ts:96,109`; meili offset âm tương tự `meilisearch.service.ts:157`). Cursor NaN ở feed/comments/bookmarks/notifications controllers → Prisma validation error 500. Fix: DTO + ParseIntPipe/Min như explore đã làm.

**M7. SSE `streams` Map không bao giờ prune + publish broadcast mọi instance**
- `notifications.service.ts:40,177-186`: Subject tạo per-userId, không xóa khi hết subscriber → tăng vô hạn theo unique users. `pushToStream` (:100-115) publish MỌI notification lên 1 channel; mọi instance parse mọi message kể cả khi recipient không kết nối → CPU lãng phí tỷ lệ thuận notification volume × instances. Fix: refCount cleanup (finalize → delete khi observers=0); về sau channel per-user hoặc check local map trước khi parse payload nặng.

**M8. Test quality: unit-mock thuần, không chứng minh counter integrity**
- `test/social-engagement.spec.ts:17`: `$transaction: vi.fn().mockResolvedValue([])` — mọi assert là "transaction được gọi", không verify likeCount đúng, không test race thật. Điểm cộng: test P2002 idempotency (:73-82) đúng branch. Thiếu: unfollow, addComment/deleteComment counter, share, reconciliation. Fix: integration test với Postgres thật (testcontainers) cho counter paths.

## Low

- **L1** `social.gateway.ts:40-65`: JWT verify chỉ tại handshake; user bị ban/revoke giữ socket đã identify tới khi disconnect. Impact thấp (gateway read-only broadcast, userId không dùng cho gì privileged) — ghi nhận, không cần fix ngay.
- **L2** `social.gateway.ts:81-93`: join-post không cap số room/socket → client join hàng triệu room id → memory adapter. Cap ~50 room/socket.
- **L3** `social.service.ts:435-443`: `replyCount` count ngoài transaction → drift commentCount khi reply đồng thời; reconciliation 3AM heal (`reconciliation.service.ts:69-77`). Chấp nhận được.
- **L4** `reconciliation.service.ts:34-36`: lock fail → chạy trên MỌI instance đồng thời → khả năng deadlock giữa các set-based UPDATE lớn. Nên skip thay vì fall-through, hoặc jitter.
- **L5** `meilisearch.service.ts:105-113`: doc `likeCount` chỉ update khi post create/update, không khi react → sortable attr stale. Không dùng để rank query hiện tại — informational.
- **L6** `feed.service.ts:20-31`: block user xong feed cache 30s vẫn hiện bài; `getBlockedUserIds` → `notIn` array không bound. OK hiện tại, note khi block list lớn.
- Share (`reactions.controller.ts:48-53`): unauth + 30/min/IP, không dedup như clicklog → shareCount inflate chậm được. Low vì shareCount chưa vào scoring (M1).

## Điểm tốt (risk calibration)

- Counter math dùng atomic increment trong transaction + PK làm source of truth + P2002/P2025 idempotency (`social.service.ts:50-65,181-210`) — đúng pattern.
- Reconciliation set-based chỉ touch row drift, có distributed lock (`reconciliation.service.ts`). Trending refresh CONCURRENTLY + lock TTL < interval đúng.
- Raw SQL: toàn bộ dùng `Prisma.sql`/tagged template parameterized (`posts.service.ts:199-224`, `stats.service.ts:30-38`, `search.service.ts:97-110`) — không thấy injection. `$executeRawUnsafe` chỉ với string hằng.
- Fanout queue processor phân trang cursor + `skipDuplicates` idempotent retry-safe (`notification.processor.ts`).

## Architecture readiness for social scale: 6/10

Nền đúng hướng (MV trending, queue fanout, Redis adapter đa instance, reconciliation), nhưng chưa chịu được tải hostile/viral. Top 3 structural risks:

1. **Single Redis noeviction là single point of cascading failure**: cache + BullMQ + socket.io adapter + SSE pubsub + locks chung 512MB. Redis đầy/chết → mất đồng thời cache (500 do unguarded set), queue, realtime. Cần: fail-open cache wrapper trước, tách keyspace/instance khi scale.
2. **Pull-model feed**: `WHERE EXISTS(follows)` + orderBy id desc (`feed.service.ts:32-44`) — planner phải scan posts theo id desc rồi probe follow membership; với user follow ít người/author ít bài → scan sâu. 30s per-user cache chỉ giảm tần suất, không giảm worst-case. Incremental path: (a) composite index `posts(user_id, id desc)` + query dạng `userId IN (follow list)` khi following < ~500; (b) fanout-on-write vào bảng feed_entries cho active users; cursor id desc giữ nguyên semantics.
3. **Boundary validation không đồng đều**: nơi có DTO chuẩn (explore, QueryPostsDto), nơi `Number()` thô (C1, M6) — pattern AI-generated không nhất quán; một endpoint public unclamped là đủ sập single server. Cần convention bắt buộc: mọi pagination param qua DTO validated.

## Recommended actions (ưu tiên)

1. C1: clamp limit/cursor tất cả controllers (DTO) — 1 giờ, chặn DoS rẻ nhất.
2. H1: global ThrottlerGuard qua APP_GUARD.
3. H2: try/catch quanh cache get/set + Max offset explore.
4. H3: tiebreaker id cho sortBy likeCount/clickCount; search → FTS path.
5. M1: recreate trending MV với share_count (kèm hệ số score).
6. M3/M5: catch P2025 unfollow; notification create → fire-and-forget.
7. M8: integration test counter paths với DB thật.

## Unresolved questions

- pgBouncer transaction mode: connection string đã có `pgbouncer=true` chưa? (interactive tx trong `blocks.service.ts:22-47` cần nó — ngoài scope đọc, chưa verify env).
- `explore` cache key theo offset: có ý định chuyển explore sang keyset trước khi mở public không? Ảnh hưởng chọn fix M2.
