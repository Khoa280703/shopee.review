# Phase 2 — Moderation 2 mức + xoá mềm + DB: báo cáo triển khai

Plan: `plans/261006-2207-audit-remediation/plan.md` · Nguồn: `plans/reports/code-reviewer-261006-2114-backend-audit.md`, `plans/reports/code-reviewer-261006-2114-database-audit.md`. Xây trên Phase 1 (đã có trong working tree, không đụng/không revert).

## Tóm tắt

Đã triển khai đủ: ban 2 mức (suspend/ban) với kill-session, xoá mềm Post/Comment + restore, ẩn nội dung banned/deleted ở mọi read path (feed/explore/trending/search Meili+FTS/detail/profile/`/users/:username/posts`/comments/`/r/:postId`), sequence bigint thật sự có hiệu lực, dọn index theo audit, fix spam notification LIKE/FOLLOW, fix race click-dedup. Test: 135/135 pass trên server. Build backend + frontend pass. Migration áp dụng sạch từ zero trên Postgres tạm; `prisma migrate diff` rỗng.

## 1. Schema & migration

File: `packages/database/prisma/schema.prisma`, migration mới `packages/database/prisma/migrations/20261006230000_moderation_levels_soft_delete_and_indexes/migration.sql` (tên mô tả, không gắn phase/plan ID).

- `User.suspendedAt` (mức 1, khoá login, nội dung vẫn hiện). `bannedAt` (có sẵn) là mức 2.
- `Post`/`Comment`: thêm `deletedAt`, `deletedById` (FK → `users.id`, `ON DELETE SET NULL`), `deleteReason` (`varchar(500)`). Không soft-delete User — xoá tài khoản (`DELETE /users/me`) vẫn hard-delete + cascade như cũ, đúng yêu cầu.
- Sequence: `ALTER SEQUENCE click_logs_id_seq AS bigint; ALTER SEQUENCE notifications_id_seq AS bigint;` — migration BIGINT trước đó (`20260710115500`) chỉ đổi kiểu cột, sequence vẫn `integer` (audit H1), giờ mới thật sự mở rộng horizon tới 2^63.
- Index dọn theo audit: drop 3 index thừa (`follows_follower_id_idx`, `comments_post_id_idx`, `click_logs_post_id_idx`) + `follows_following_id_idx` cũ (thay bằng composite) + `notifications_recipient_id_read_idx` cũ (thay bằng composite theo sort thật). Thêm (modeled trong Prisma): `follows(followingId, followerId)`, `notifications(recipientId, id DESC)`.
- Index cho filter mới (deletedAt/bannedAt), raw vì Prisma không model được partial index — theo đúng pattern đã có sẵn trong repo (trgm, partial-unique NEW_POST): `posts_category_id_visible_idx (category_id, id DESC) WHERE deleted_at IS NULL`, `comments_visible_post_id_parent_id_id_idx (post_id, parent_id, id) WHERE deleted_at IS NULL`, `notifications_unread_idx (recipient_id) WHERE NOT read`.
- Partial unique mới `notifications_like_follow_dedup_idx (recipient_id, actor_id, type, COALESCE(post_id,0)) WHERE type IN ('LIKE','FOLLOW')` — nền tảng cho fix spam notification (mục 4).
- `trending_posts_mv`: DROP+CREATE, thêm `AND p.deleted_at IS NULL` vào nguồn — bài xoá mềm rụng khỏi trending sau tối đa 1 chu kỳ refresh (5 phút, độ trễ đã chấp nhận sẵn cho mọi số liệu trending khác). Lọc `banned_at` làm live tại read-time (join `users` trong `queryTrending`), không chờ refresh.
- Đã verify trên Postgres tạm (`postgres:16-alpine`, `127.0.0.1:55432`, đã `docker rm -f` sau khi xong): `prisma migrate deploy` từ zero (20 migration) pass; `prisma migrate diff --from-url ... --to-schema-datamodel schema.prisma --script` → `-- This is an empty migration.`; kiểm tra trực tiếp `pg_sequences` (cả 2 sequence `bigint`), `pg_indexes` (6 index mới tồn tại, 7 index cũ đã biến mất đúng như dự kiến), FK `posts_deleted_by_id_fkey`/`comments_deleted_by_id_fkey`, và `pg_get_viewdef` của MV chứa `deleted_at`.

## 2. Moderation 2 mức

`apps/backend/src/moderation/admin.service.ts` (viết lại), `admin.controller.ts`, `reports.service.ts` (+`autoResolve`), DTO mới `dto/delete-reason.dto.ts`.

- **Suspend** (`POST /admin/users/:id/suspend`, `.../unsuspend`): set `suspendedAt` + bump `tokenVersion` + xoá toàn bộ `sessions` của user — khoá login ngay, nội dung không đổi.
- **Ban** (`POST /admin/users/:id/ban`, `.../unban` — endpoint có sẵn, đã nâng cấp): thêm bump `tokenVersion` + xoá sessions (trước đây chỉ bump tokenVersion, sessions cũ nằm lại vô dụng trong danh sách "active sessions" — nay dọn sạch luôn cho nhất quán với suspend); đồng bộ Meilisearch: `MeilisearchService.deletePosts()`/`reindexPosts()` (mới) gỡ/khôi phục toàn bộ post của user khỏi index khi ban/unban (best-effort, không chặn action chính).
- `JwtStrategy`/`AuthService.validateUser`/`googleLogin`/`facebookLogin`: cả 2 mức đều chặn login (trước đây `validateUser` **không hề check `bannedAt`** — một user bị ban vẫn login được bằng password, nhận cookie hợp lệ, chỉ fail ở request tiếp theo do tokenVersion lệch; đã vá luôn lỗ hổng này cho cả OAuth, không chỉ suspend mới).
- Tích hợp "report approve flow": `deletePost`/`deleteComment`/`ban`/`suspend` đều gọi `ReportsService.autoResolve()` — tự RESOLVE mọi report PENDING nhắm vào target đó (fix DB-audit M9: report của target đã xử lý không bao giờ tự đóng).
- Không thể tự suspend/ban chính mình hoặc admin khác (giữ nguyên rule cũ của `ban`, áp dụng y hệt cho `suspend`).

## 3. Xoá mềm Post & Comment

`posts.service.ts`, `social.service.ts`.

- `Post.remove()` (tự xoá) và `adminRemovePost()` (moderation, có `reason` optional) đều set `deletedAt/deletedById/deleteReason` thay vì `prisma.post.delete`. `restorePost()` (admin) clear 3 cột, re-index Meili.
- `Comment.deleteComment()`/`adminDeleteComment()` tương tự; `restoreComment()` mới. **Quyết định kỹ thuật**: bỏ cascade thủ công sang reply (code cũ hard-delete phải tự `DELETE WHERE id=? OR parent_id=?` vì FK `onDelete:Cascade` sẽ âm thầm xoá reply mà không đếm được). Với soft-delete, mỗi comment độc lập — xoá/khôi phục 1 comment chỉ ảnh hưởng đúng 1 row, không cascade. Lý do: giữ đúng tinh thần "mọi gỡ nội dung xoá mềm được khôi phục khi kháng cáo" — nếu cascade xoá cả reply thì không thể khôi phục chính xác (sẽ không biết reply nào bị xoá "kèm theo" vs "độc lập"). Counter (`commentCount`) vẫn đúng: ±1 mỗi thao tác, trong transaction cùng việc set/clear `deletedAt`.
- Mọi read path lọc `deletedAt IS NULL` qua helper DRY mới `apps/backend/src/common/visible-content.ts`: `VISIBLE_POST_WHERE`/`VISIBLE_COMMENT_WHERE` (Prisma where-fragment) + `VISIBLE_POST_SQL` (raw SQL, dùng alias `p`/`u` sẵn có khắp các raw query). Áp dụng tại: `PostsService.findAll/findOne/queryExplore/querySearch`, `queryTrending` (lọc `bannedAt` live qua join), `FeedService.queryFeed`, `UsersService.getUserPosts` (+ 404 toàn bộ nếu chính user bị ban, parity với profile), `SearchService.ftsSearchPosts`/`loadPostsByIds` (backstop cho cả nhánh Meili lẫn FTS), `SocialService` (thêm helper `assertPostVisible()` dùng chung cho react/bookmark/share/addComment/getComments/getReplies — một bài đã xoá mềm hoặc tác giả bị ban thì mọi tương tác đều 404, không chỉ đọc), `listBookmarks` (lọc theo post lồng nhau).
- `TrackerService` (`/r/:postId`): 404 + **không ghi click** khi bài đã xoá mềm hoặc tác giả bị ban (trước đây hoàn toàn không kiểm tra — audit H3 "ban scammer mà link vẫn ra tiền").
- `ReconciliationService` (cron 3h sáng): sửa 2 câu UPDATE tính lại `comment_count` để lọc `deleted_at IS NULL` — nếu không sửa, job đêm sẽ âm thầm phục hồi comment_count về tổng TẤT CẢ comment (kể cả đã xoá mềm), huỷ ngược mọi thao tác xoá/khôi phục trong ngày.

## 4. Index & hygiene khác

- **Click-dedup race** (audit L4/H1 cũ): `TrackerService` chuyển sang `redis.set(key, '1', {NX:true, EX:3600})` — 1 lệnh atomic, không còn race read-then-write (2 request cùng lúc trước đây có thể cùng thấy "chưa có click gần đây" rồi cùng insert). Khi Redis không sẵn sàng (host dev / Redis lỗi) fallback về check DB cũ (degrade, không fail cứng).
- **Spam notification LIKE/FOLLOW** (audit M2): `NotificationsService.create()` dùng raw `INSERT ... ON CONFLICT (...) WHERE type IN ('LIKE','FOLLOW') DO UPDATE SET created_at=now(), read=false` trên partial unique index mới — toggle reaction on/off/on hay unfollow/refollow liên tục chỉ bump 1 row hiện có (và chỉ 1 SSE push), không sinh thêm row/notification mới. COMMENT/NEW_POST giữ nguyên hành vi cũ (mỗi comment là 1 sự kiện riêng; NEW_POST đã có dedup riêng từ trước).

## New/changed endpoints

```
POST   /admin/users/:id/suspend      (mới)
POST   /admin/users/:id/unsuspend    (mới)
POST   /admin/posts/:id/restore      (mới)
POST   /admin/comments/:id/restore   (mới)
DELETE /admin/posts/:id              (không đổi route/response shape; nay xoá MỀM thay vì cứng; body optional {reason?})
DELETE /admin/comments/:id           (tương tự, {reason?})
POST   /admin/users/:id/ban          (không đổi route; nay thêm kill-session + gỡ Meili)
POST   /admin/users/:id/unban        (không đổi route; nay thêm khôi phục Meili)
```
Response shape của các endpoint có sẵn (`{success:true}`) không đổi — đã grep frontend (`apps/frontend/src/lib/api.ts`), không cần sửa gì ở frontend cho các route này.

## Files changed

Modified:
```
packages/database/prisma/schema.prisma
apps/backend/src/auth/auth.service.ts
apps/backend/src/auth/strategies/jwt.strategy.ts
apps/backend/src/feed/feed.service.ts
apps/backend/src/maintenance/reconciliation.service.ts
apps/backend/src/moderation/admin.controller.ts
apps/backend/src/moderation/admin.service.ts
apps/backend/src/moderation/reports.service.ts
apps/backend/src/notifications/notifications.service.ts
apps/backend/src/posts/posts.service.ts
apps/backend/src/search/meilisearch.service.ts
apps/backend/src/search/search.service.ts
apps/backend/src/social/social.service.ts
apps/backend/src/tracker/tracker.service.ts
apps/backend/src/users/users.service.ts
apps/backend/test/moderation.spec.ts
apps/backend/test/production-readiness.spec.ts
apps/backend/test/social-engagement.spec.ts
```
New:
```
apps/backend/src/common/visible-content.ts
apps/backend/src/moderation/dto/delete-reason.dto.ts
apps/backend/test/moderation-soft-delete.spec.ts
packages/database/prisma/migrations/20261006230000_moderation_levels_soft_delete_and_indexes/migration.sql
```
Không đụng: `docker-compose*.yml`, Dockerfile, `nginx/`, `monitoring/`, `metrics/`, `app.module.ts` (thuộc agent song song) — đã kiểm `git status` cuối cùng để xác nhận không có file nào trong danh sách loại trừ bị sửa.

## Test & build (chạy trên `homelab:~/working-sources/shopee.review-dev`, không chạy gì trên Mac)

- `pnpm --filter @app/database build` (prisma generate + tsc): **pass**.
- `pnpm --filter @app/backend typecheck`: **pass, sạch**.
- `pnpm --filter @app/backend test`: **135/135 pass** (13 file; 102 cũ + 33 mới/sửa). Test mới/sửa: suspend vs ban (session kill, tokenVersion, không đụng field của nhau), unban khôi phục Meili, soft-delete + restore Post/Comment kèm counter, visibility matrix (`findOne`, feed, `getUserPosts`), redirect 404 cho banned/deleted ở `/r/:postId` + không ghi click, click-dedup atomic qua Redis + fallback DB, notification dedupe LIKE/FOLLOW/COMMENT/self, login bị khoá ở cả 2 mức.
- `pnpm --filter @app/backend lint`: pass (script hiện = `tsc`, chưa có ESLint thật — tình trạng có sẵn, Phase 5 mới setup).
- `pnpm --filter @app/backend build` (`nest build`): **pass**.
- `pnpm --filter @app/frontend build` (`next build`, Next 15.5.27): **pass**, 20 route, không có lỗi mới.
- Migration: `prisma migrate deploy` từ schema rỗng trên Postgres tạm (`postgres:16-alpine`, `127.0.0.1:55432`) — **20/20 migration pass**; `prisma migrate diff` (schema vs migrations) → **rỗng**. Container đã `docker rm -f` sau khi xong, không để lại tiến trình nào.

## Việc đã bỏ qua / để lại (và lý do)

1. **M8 cũ (xoá tài khoản không enqueue Meili delete)** — `DELETE /users/me` vẫn hard-delete như yêu cầu của user ("Hard delete only stays for account self-deletion"); việc nó không dọn Meili là gap có từ trước, không nằm trong danh sách việc bắt buộc của Phase 2 (khác với ban, vốn được yêu cầu rõ ràng phải gỡ search index) — để lại, ghi nhận làm việc riêng nếu cần.
2. **EXPLAIN thực tế trên index mới** — plan yêu cầu "EXPLAIN dùng index mới", nhưng Postgres tạm dùng để test migration là **rỗng** (0 row) nên planner sẽ luôn chọn seq scan bất kể index tồn tại hay không (ước lượng chi phí). Đã xác nhận THAY THẾ bằng cách kiểm tra trực tiếp `pg_indexes`/`pg_get_viewdef` (index/MV đúng định nghĩa, đúng tên, đúng predicate) — tương đương về mặt "index đã được tạo và sẽ được planner cân nhắc", nhưng không chạy được `EXPLAIN` có ý nghĩa trên dữ liệu rỗng. Không đụng DB prod (seed, nhỏ) theo đúng chỉ đạo an toàn.
3. **ESLint thật / frontend lint** — có sẵn từ Phase 1 (chưa setup), thuộc Phase 5.
4. **Report dangling khi ban (M9 nhánh report nhắm vào USER nhưng user đã bị xoá tài khoản hẳn)** — autoResolve chỉ chạy khi admin chủ động ban/suspend/xoá qua các endpoint này; không có cron riêng dọn report mồ côi vĩnh viễn (không có trong yêu cầu).
5. **Partial index cho mọi bảng đụng `bannedAt`** — chỉ thêm 2 partial index (category, comments) trực tiếp phục vụ query pattern được nêu tên trong yêu cầu + 1 cho unread notifications; không mở rộng thêm (ví dụ `posts(user_id,id) WHERE deleted_at IS NULL`) vì dữ liệu hiện là seed nhỏ, index hiện có (`posts_user_id_id_idx` không-partial) đã đủ dùng, tránh over-engineering.

## Follow-up cho Phase 3 (frontend)

- Trang `/admin` (đã tồn tại) hiện có nút ban/unban/delete — cần thêm UI cho **suspend/unsuspend** (2 nút mới, endpoint đã sẵn) và **restore post/comment** (danh sách "đã xoá" + nút khôi phục, endpoint `POST /admin/posts/:id/restore` / `.../comments/:id/restore` đã sẵn).
- Form xoá post/comment (tự xoá hoặc admin) có thể thêm ô nhập `reason` tuỳ chọn khi gọi `DELETE /admin/posts/:id`/`comments/:id` (body `{reason?: string}`, optional — không có cũng chạy bình thường).
- Response của mọi Post/Comment giờ có thêm field `deletedAt`/`deletedById`/`deleteReason` (luôn `null` ở nội dung công khai vì đã bị lọc, nhưng admin UI có thể dùng chúng nếu sau này có endpoint "xem nội dung đã xoá" riêng cho admin — hiện CHƯA có endpoint liệt kê nội dung đã xoá, chỉ có restore theo id đã biết từ report).

## Câu hỏi còn mở

Không có — các quyết định sản phẩm (2 mức ban, xoá mềm, cho login khi chưa verify) đã được user chốt trong plan; các quyết định kỹ thuật (không cascade soft-delete sang reply, đặt check ban/suspend ở `validateUser` thay vì chỉ JwtStrategy) đã nêu rõ lý do ở mục 3 và mục 2.

Status: DONE
Summary: Hoàn thành đủ phạm vi Phase 2 (ban 2 mức + kill-session, xoá mềm post/comment + restore, lọc nội dung ẩn ở mọi read path, sequence bigint thật sự hiệu lực, index hygiene, fix spam notification + race click-dedup); 135/135 test pass, build backend+frontend pass, migration áp dụng sạch từ zero và `prisma migrate diff` rỗng trên Postgres tạm.
