# Phase 3 — UX: báo cáo triển khai

Plan: `plans/261006-2207-audit-remediation/plan.md` · Nguồn: `plans/reports/code-reviewer-261006-2114-frontend-ux-audit.md`. Xây trên Phase 1+2 (đã có trong working tree, không đụng/không revert) và song song với Phase 4 (infra) — không chạm file do Phase 4 sở hữu (đã kiểm `git status` cuối cùng: không có `docker-compose*.yml`, `monitoring/`, Dockerfile, `nginx/`, `.env.example`, `docs/deployment-guide.md`, `docs/system-architecture.md`, `README.md`, `apps/backend/src/metrics/`, dòng metrics trong `app.module.ts`).

## Tóm tắt

Đã sửa toàn bộ 5 High + phần lớn Medium liên quan tới 12 mục "tối thiểu" trong yêu cầu, cộng một số Low rẻ tiền chạm trúng file đang sửa. Backend: viewer-state batch-attach (xoá N+1 reaction), bookmark idempotent set/status, endpoint liệt kê nội dung đã xoá (mới). Frontend: follow/bookmark state đúng, tab Following có skeleton/error/empty đúng nghĩa, font Material Symbols subset + `display=block` qua `<link>` thay vì `@import`, Tailwind font-family trỏ về biến `next/font`, comment IME + dedupe + giữ chữ khi lỗi + phân trang, mobile sticky/toast/iOS-tap, login `?next=` xuyên suốt (kể cả OAuth qua sessionStorage), Socket.io chỉ mở khi có comment thread, JSON-LD/canonical đúng, admin UI đầy đủ (suspend/unsuspend, ban, xoá có lý do, danh sách "Đã xoá" + khôi phục).

Test & build trên `homelab:~/working-sources/shopee.review-dev`: backend typecheck sạch, **146/146 test pass** (13 cũ + 8 test mới ở `viewer-post-state.spec.ts` + vài test sửa cho idempotent bookmark), backend build pass, frontend typecheck sạch, frontend build pass (20 route). Không chạy gì trên Mac.

---

## Theo từng audit finding

### High

| # | Việc | Trạng thái | Chi tiết |
|---|---|---|---|
| H1 | Follow button SSR-không-cookie + cache bug, kẹt 2 lần bấm | **FIXED** | Bỏ hẳn `initialFollowing`/effect refetch-toàn-profile trong `UserProfileHeader` (`components/user/user-profile-header.tsx`); `FollowButton` tự fetch `followStatus` giống trang post detail — không còn seed cache sai rồi đóng băng ở `staleTime: Infinity`. Bonus: giảm 1 trong 3 lần gọi `/users/:username` mỗi lượt xem profile (P2). |
| H2 | Bookmark luôn "chưa lưu" trên post detail, bấm đầu có thể mất lưu | **FIXED** | Backend: `PUT /posts/:id/bookmark` đổi sang idempotent `{bookmarked: boolean}` (`SocialService.setBookmark`, swallow P2002/P2025 — xem `social.service.ts`), thêm `GET /posts/:id/bookmark` (`SocialService.bookmarkStatus`). Frontend: `BookmarkButton` chuyển sang `useQuery`/`useMutation` như `ReactionButton`, không còn tự quản state bằng `useState` lệch SSR/CSR. |
| H3 | Tab "Đang theo dõi" luôn hiện hộp trống, không skeleton/error | **FIXED** | Viết lại `LoadMorePosts` (`components/post/load-more-posts.tsx`): `isLoading` → `PostFeedSkeleton`/`PostGridSkeleton` (đã có sẵn, trước đây không được dùng); `isError && posts.length===0` → khối lỗi có nút Thử lại; empty thật sự mới render `emptyState`. `HomeFeedTabs` dùng prop `emptyState` mới thay vì render CTA cứng dưới feed. |
| H4 | Font: `@import` Material Symbols full-axis, Tailwind trỏ `'Inter'` literal | **FIXED** | (a) Bỏ `@import` trong `globals.css`; nạp qua `<link rel="preconnect">` + `<link rel="stylesheet">` trong `app/layout.tsx` (preload-scanner thấy ngay trong HTML, không còn chặn phía sau CSS). Pin trục `opsz=24,wght=400,GRAD=0` (FILL vẫn `0..1` vì `fill` prop toggle runtime), thêm `&icon_names=<35 icon thực dùng>` (grep toàn bộ `<Icon name=.../icon=...>`, kể cả tên động như `star_half`), `&display=block` để chữ ligature không bao giờ chớp. (b) `tailwind.config.ts` fontFamily: `'Inter'` → `var(--font-inter), system-ui, sans-serif` cho mọi token (`sans`, `display-lg`, `body-md`, ...) — khớp với biến `next/font` đã đăng ký ở `layout.tsx:17`. Cheap bonus: `settings/page.tsx` dùng class `font-title-md`/`text-title-md` không tồn tại trong config → đổi về `font-headline-md`/`text-headline-md` (h2 các section giờ có style thật). |
| H5 | N+1 `GET /posts/:id/reactions/me` trên feed | **FIXED** | Helper mới `common/viewer-post-flags.ts` (`attachViewerPostState`) — 2 query batch (`reaction.findMany`/`bookmark.findMany` theo `postId IN (...)`) thay vì N query, áp dụng SAU khi đọc cache Redis (không bao giờ bake state theo-viewer vào cache dùng chung) ở: `PostsService.findAll/findExplore` (+ querySearch), `FeedService.getFeed` (cache-hit lẫn fresh), `UsersService.getUserPosts`, `SocialService.listBookmarks`. Frontend: `Post.viewerReaction?`/`Post.bookmarked?` mới trong `types/index.ts`; `ReactionButton` nhận `initialReaction` — khi backend đã đính kèm (kể cả `null`), seed `initialData` + `staleTime: Infinity`, **0 request** thay vì 1/post; khi không có (anonymous) fallback y hệt hành vi cũ. `PostFeedCard` truyền `post.viewerReaction` xuống. Trang post detail (SSR ẩn danh/cache 30s) **không** đính kèm viewer-state (tránh rò rỉ cache giữa các user) — giữ nguyên fetch riêng, vốn đã chỉ 1 request/trang (không phải N+1). |

### Medium (trong 12 mục + vài mục liên quan rẻ)

| # | Việc | Trạng thái |
|---|---|---|
| M1 (IME) | Enter khi đang gõ IME gửi chữ chưa xong; Enter/click kép tạo trùng | **FIXED** — `isSubmitEnter()` check `e.nativeEvent.isComposing` + cờ `submitting` (disable input+nút) ở cả ô comment gốc và ô reply trong `comments-section.tsx`. |
| M2 (dedupe) | Socket emit trước REST response → comment/reply trùng | **FIXED** — gộp 1 chỗ dùng chung `components/social/comment-utils.ts` (`upsertTopLevelComment`/`upsertReply`, dedupe theo id), dùng cả ở optimistic REST insert (`comments-section.tsx`) lẫn socket handler (`use-comment-socket.ts`) — khớp đề xuất "một hàm upsertComment dùng chung". |
| M3 (giữ chữ khi lỗi) | Reply lỗi vẫn xoá chữ, đóng ô | **FIXED** — `reply()` nay trả `Promise<boolean>`; `CommentItem.submitReply()` chỉ `setText('')`/đóng ô khi `ok===true`. |
| M4 (phân trang) | Comment cấp 1 chỉ load trang đầu, bỏ `nextCursor` | **FIXED** — lưu `nextCursor`, nút "Xem thêm bình luận" (`comments.loadMoreComments`, key i18n mới) gọi lại `socialApi.comments(postId, cursor)`, dedupe theo id. Reply "xem thêm" vốn đã có sẵn, không đổi. |
| M5 (iOS reaction tap) | `onMouseEnter` mở picker ngay cả khi tap (ghost mouse event trên WebKit) | **FIXED** — đổi sang `onPointerEnter` chỉ mở picker khi `e.pointerType==='mouse'`; long-press (touch) giữ nguyên qua `onTouchStart`. Thêm `aria-pressed`/`aria-haspopup` trên nút reaction (Low a11y, rẻ vì đang sửa cùng file). **Chưa kiểm trên iPhone thật** (không có thiết bị) — đúng như "Unresolved Question" gốc của audit, logic đã đổi đúng theo gợi ý nhưng cần verify thực tế. |
| M6 (sticky overlap) | Tab/sticky header trang Thông báo trượt xuống dưới header mobile | **FIXED** — `home-feed-tabs.tsx`, `app/notifications/page.tsx`: `top-14 lg:top-0` thay vì `top-0`. |
| M8 (login next) | Hành động client (react/follow/bookmark/comment/create-prompt/mobile-nav) không kèm `?next=`; register/OAuth luôn về `/` | **FIXED** — helper mới `lib/login-href.ts` (`loginHref(path)`, validate same-origin relative path) dùng ở `reaction-button.tsx`, `bookmark-button.tsx`, `follow-button.tsx`, `comments-section.tsx` (2 chỗ), `create-post-prompt.tsx`, `mobile-nav.tsx` (3 mục auth + mục profile khi chưa đăng nhập). OAuth là full-page redirect (không giữ được SPA state) → relay `next` qua `sessionStorage` (`authReturnTo`), set ở `login`/`register` trước khi điều hướng sang Google/Facebook, đọc + validate lại ở `auth/callback/page.tsx` (cùng rule same-origin). Register page giờ cũng đọc `?next=` và redirect đúng sau khi đăng ký. |
| M9 | Không có UI sửa/xoá bài của chính mình | **SKIPPED** — không nằm trong 12 mục "tối thiểu"; đây là một tính năng UI mới đáng kể (menu "...", form sửa, xác nhận xoá) chứ không phải fix nhỏ, để lại cho một phase riêng nếu cần. |
| M10/M11 (error states/mutation catch) | Lỗi bị nuốt/hiện như rỗng ở nhiều nơi | **PHẦN MỞ ĐƯỢC YÊU CẦU: FIXED** — `load-more-posts.tsx` (trang đầu + trang sau, xem H3/M16); thêm `catch`+toast ở `block-button.tsx`, `saved/page.tsx` (loadMore), `forgot-password/page.tsx`, `settings/page.tsx` (`unblock`/`revokeSession`/`revokeOtherSessions`/`onAvatar`), `use-notifications.ts` (`markAllRead`, `loadMore`), `admin/page.tsx` (toàn bộ action mới đều có catch+toast). **Còn lại ngoài 12 mục** (profile posts, category, dashboard chart, notifications-list "Đang tải" mãi) — chưa sửa, cần `ErrorState` dùng chung (code-cleanliness #4), để lại. |
| M12 | Trang Thông báo: không loading state, không phân biệt unread | **SKIPPED** — không trong 12 mục; để lại. |
| M13/M14 | Form tạo bài (race scrape, productMeta không reset...), upload ảnh tuần tự | **SKIPPED** — không trong 12 mục, cần nhiều thay đổi logic (AbortController, resize ảnh canvas, concurrency). Chỉ fix nhỏ lây lan: `onAvatar` trong settings giờ reset `e.target.value=''` sau khi xong (để chọn lại cùng file), tiện thể vì đang sửa catch ở đúng hàm đó. |
| M15 | Lỗi backend tiếng Việt hiện thẳng cho locale `en` | **SKIPPED** — cần map `status`/`code` → key i18n, không rẻ, không trong 12 mục. |
| M16 (retry loop) | Lỗi trang sau lặp request vô hạn | **FIXED (bonus, cùng lúc viết lại H3)** — `useInfiniteQuery({retry:false})`, observer chỉ gọi `fetchNextPage` khi `!isFetchNextPageError`; thêm nút "Thử lại" + dòng "Đã hết bài viết." khi hết trang. |
| M17 (dedupe keyset) | Explore OFFSET-pagination có thể trùng/sót bài giữa trang | **PHẦN FE: FIXED (bonus)** — `select` trong `useInfiniteQuery` dedupe theo `post.id` qua toàn bộ `pages` đã load. Phần BE (snapshot/keyset thật) không đụng — ngoài 12 mục, rủi ro cao hơn lợi ích ở quy mô hiện tại. |
| M18 | Search race condition, không đồng bộ URL | **SKIPPED** — không trong 12 mục. |
| M19 (toast che nav) | Toast `bottom-4` đè dưới bottom nav mobile | **FIXED** — `bottom-20 lg:bottom-6`; toast lỗi dùng `role="alert"` (thành công/info giữ `role="status"`). |
| P1 (socket luôn mở) | Socket.io `autoConnect:true` cho mọi visitor mọi trang | **FIXED** — `lib/socket.ts` viết lại: `autoConnect:false`, thêm `acquireSocket()`/`releaseSocket()` đếm tham chiếu; `useCommentSocket` (chỗ DUY NHẤT dùng Socket.io trong app) gọi `acquireSocket()` khi mount, `releaseSocket()` khi unmount — kết nối chỉ tồn tại khi có người đang xem thread comment của 1 bài, không phải mọi trang. `SocketProvider` không còn tự connect lúc mount. |
| P2 (profile 3 lần gọi) | Profile gọi backend 3 lần/view | **PHẦN: FIXED** — bỏ 1 lần gọi thừa (client refetch-toàn-profile để lấy `isFollowing`, xem H1). `generateMetadata` + page vẫn gọi riêng (2 lần) — bọc `cache()` của React không nằm trong 12 mục, để lại. |
| S1 (JSON-LD rating) | `reviewRating` dùng rating shop/sản phẩm, không phải của reviewer | **FIXED** — bỏ `reviewRating` cấp cao nhất; rating (nếu có) chuyển vào `itemReviewed.aggregateRating` (đúng ngữ nghĩa: đó LÀ rating của sản phẩm trên Shopee, không phải của người review). Thêm `reviewBody`, `image`, `url` như gợi ý. |
| S2 (canonical sai) | Canonical dùng `username` từ URL param, không phải tác giả thật | **FIXED** — `generateMetadata` và component chính đều dùng `post.user.username`; thêm `permanentRedirect` khi route param `username` không khớp tác giả thật (trước đây bài vẫn render ở URL sai, giờ 301 về URL đúng). |

### Mục 11 — Admin UI (đã triển khai đầy đủ)

- Backend mới (chưa có trước đây — theo đúng note "Follow-up cho Phase 3" của báo cáo Phase 2): `GET /admin/posts/deleted` và `GET /admin/comments/deleted` (cursor-paginated, kèm tác giả + người xoá + lý do) — `AdminService.listDeletedPosts/listDeletedComments`, `AdminController`.
- `adminApi` (frontend) thêm `restorePost/restoreComment/listDeletedPosts/listDeletedComments/suspendUser/unsuspendUser`; `deletePost/deleteComment` giờ nhận `reason?: string`.
- `/admin` viết lại thành 2 tab: **"Báo cáo chờ xử lý"** (giữ nguyên luồng cũ, thêm input lý do tuỳ chọn cho xoá post/comment, thêm nút "Khoá đăng nhập" (suspend) cạnh "Khoá tài khoản" (ban) cho report nhắm USER) và **"Nội dung đã xoá"** (2 danh sách post/comment đã xoá mềm, hiện tác giả/người xoá/lý do/thời gian, nút "Khôi phục" gọi endpoint restore có sẵn từ Phase 2, phân trang "Xem thêm").
- **Giới hạn đã biết**: không có trang quản lý toàn bộ user (list all users) để unban/unsuspend một tài khoản KHÔNG còn report PENDING — đây là tính năng chưa từng tồn tại (kể cả trước Phase 3), ngoài phạm vi yêu cầu ("suspend/unsuspend buttons, ban/unban, và danh sách Đã xoá" — không yêu cầu user management đầy đủ). `unbanUser`/`unsuspendUser` trong `adminApi` sẵn sàng dùng khi có UI đó sau này.

---

## Files changed

### Backend
```
apps/backend/src/common/viewer-post-flags.ts        (mới)
apps/backend/src/social/dto/set-bookmark.dto.ts      (mới)
apps/backend/src/social/social.service.ts            (toggleBookmark -> setBookmark/bookmarkStatus; listBookmarks enrich)
apps/backend/src/social/bookmarks.controller.ts       (PUT idempotent + GET status)
apps/backend/src/posts/posts.service.ts              (findAll/findExplore/querySearch nhận viewerId, attach state)
apps/backend/src/posts/posts.controller.ts            (OptionalJwtAuthGuard cho findAll/findExplore)
apps/backend/src/feed/feed.service.ts                 (attach state cả nhánh cache-hit lẫn fresh)
apps/backend/src/users/users.service.ts                (getUserPosts nhận viewerId)
apps/backend/src/users/users.controller.ts             (OptionalJwtAuthGuard cho :username/posts)
apps/backend/src/moderation/admin.service.ts           (listDeletedPosts/listDeletedComments)
apps/backend/src/moderation/admin.controller.ts        (2 endpoint mới)
apps/backend/test/social-engagement.spec.ts            (test idempotent set/status thay toggle)
apps/backend/test/production-readiness.spec.ts         (thêm mock reaction/bookmark cho FeedService test)
apps/backend/test/viewer-post-state.spec.ts             (mới — 8 test)
```

### Frontend
```
apps/frontend/src/lib/api.ts                           (apiFetch: fix header-override trap + forward cookie SSR có no-store; bookmark idempotent API; adminApi mở rộng)
apps/frontend/src/lib/login-href.ts                     (mới)
apps/frontend/src/lib/socket.ts                         (acquireSocket/releaseSocket, autoConnect:false)
apps/frontend/src/types/index.ts                        (Post.viewerReaction?/bookmarked?)
apps/frontend/src/app/layout.tsx                        (Material Symbols qua <link>, bỏ @import)
apps/frontend/src/app/globals.css                       (bỏ @import)
apps/frontend/tailwind.config.ts                        (fontFamily -> var(--font-inter))
apps/frontend/src/app/[username]/[postId]/page.tsx      (JSON-LD S1, canonical+redirect S2)
apps/frontend/src/app/admin/page.tsx                     (viết lại: 2 tab, reason input, suspend, deleted-list+restore)
apps/frontend/src/app/auth/login/page.tsx                (storeReturnTo cho OAuth)
apps/frontend/src/app/auth/register/page.tsx             (next param + storeReturnTo)
apps/frontend/src/app/auth/callback/page.tsx              (đọc authReturnTo)
apps/frontend/src/app/auth/forgot-password/page.tsx       (catch + toast)
apps/frontend/src/app/notifications/page.tsx              (sticky top-14)
apps/frontend/src/app/saved/page.tsx                      (loginHref, catch+toast loadMore)
apps/frontend/src/app/settings/page.tsx                   (catch+toast cho unblock/session/avatar, font class fix)
apps/frontend/src/components/user/user-profile-header.tsx (bỏ initialFollowing/effect — H1)
apps/frontend/src/components/social/follow-button.tsx     (loginHref, aria-pressed)
apps/frontend/src/components/social/bookmark-button.tsx   (viết lại: react-query idempotent)
apps/frontend/src/components/social/reaction-button.tsx    (initialReaction seed, pointer-aware hover, aria)
apps/frontend/src/components/social/comments-section.tsx   (viết lại: IME, dedupe, giữ chữ lỗi, phân trang)
apps/frontend/src/components/social/use-comment-socket.ts  (dùng comment-utils; acquire/releaseSocket)
apps/frontend/src/components/social/comment-utils.ts        (mới)
apps/frontend/src/components/post/post-feed-card.tsx        (truyền initialReaction)
apps/frontend/src/components/post/load-more-posts.tsx        (viết lại: skeleton/error/empty/retry/end — H3+M16+M17)
apps/frontend/src/components/post/home-feed-tabs.tsx          (emptyState prop, sticky top-14)
apps/frontend/src/components/post/post-grid.tsx               (không đổi logic, dùng lại skeleton có sẵn)
apps/frontend/src/components/providers/socket-provider.tsx    (không tự connect)
apps/frontend/src/components/providers/toast-provider.tsx     (bottom-20, role=alert)
apps/frontend/src/components/moderation/block-button.tsx       (catch+toast)
apps/frontend/src/components/layout/mobile-nav.tsx              (loginHref)
apps/frontend/src/components/post/create-post-prompt.tsx         (loginHref)
apps/frontend/src/hooks/use-notifications.ts                     (catch cho markAllRead/loadMore)
apps/frontend/src/messages/vi.json, en.json                       (key mới: admin.*, social.comments.loadMoreComments, post.loadError/loadMoreError/endOfList, moderation.error, settings.actionFailed/avatarUploadFailed, auth.forgot.error — vi/en khớp 100%, đã verify bằng script)
```

## Test & build (trên `homelab:~/working-sources/shopee.review-dev`)

- `pnpm --filter @app/database build`: pass.
- `pnpm --filter @app/backend typecheck`: pass, sạch.
- `pnpm --filter @app/frontend typecheck`: pass, sạch (1 lỗi `Cannot find name 'UserSummary'` phát hiện qua lần chạy đầu — đã fix, chạy lại sạch).
- `pnpm --filter @app/backend test`: **146/146 pass** (14 file — 6 file cũ của Phase 1/2 giữ nguyên, 8 test mới trong `viewer-post-state.spec.ts`, các test bookmark sửa lại cho API idempotent).
- `pnpm --filter @app/backend build` (`nest build`): pass.
- `pnpm --filter @app/frontend build` (`next build`, Next 15.5.27): pass, 20 route, 0 lỗi.
- i18n: script so khớp key vi/en toàn bộ file → 0 lệch.
- First Load JS (sau khi build xong Phase 3): `/` 236 kB, `/[username]` 237 kB, `/[username]/[postId]` 246 kB, `/admin` 211 kB, shared 185 kB. **Không có baseline "trước Phase 3" để so sánh** — server clone không phải git repo (rsync, không `.git`) và Mac repo có Phase 1+2 đã uncommitted chồng lên nhau từ trước khi Phase 3 bắt đầu, nên không có mốc commit an toàn để diff mà không rủi ro mất việc đã làm của Phase 1/2. Số liệu trên là con số thực tế SAU Phase 3, dùng làm baseline cho Phase 5 (khi có CI build).

## Việc đã bỏ qua / để lại (và lý do)

1. M9 (sửa/xoá bài tự thân), M12 (notifications loading/unread UI), M13/M14 (độ bền form tạo bài + upload ảnh), M15 (map lỗi BE sang i18n theo status/code), M18 (search race) — đều là Medium **ngoài** 12 mục "tối thiểu", mỗi cái cần đổi logic/contract đáng kể hơn một fix nhỏ; để lại cho phase sau hoặc yêu cầu riêng.
2. M10/M11 phần còn lại (profile posts/category/dashboard/notifications-list vẫn hiện "Đang tải"/rỗng khi lỗi) — cần `ErrorState` dùng chung (code-cleanliness #4), chưa làm vì không nằm trong 12 mục; phần được liệt kê rõ trong yêu cầu (load more posts, admin, saved, settings, block, forgot-password, notifications hook) đã xong.
3. A11y: chỉ thêm `aria-pressed`/`aria-haspopup`/`role=alert` ở đúng những component đang sửa (reaction/follow/bookmark/toast). Dialog focus-trap (`ReportDialog`, lightbox), label cho input, `role=tablist` cho các tab — không đụng, là Medium/Low riêng biệt không nằm trong 12 mục.
4. Code-cleanliness (chuẩn hoá react-query toàn bộ, tách settings 330 dòng, xoá dead code, `ErrorState`/`EmptyState` dùng chung rộng hơn) — Phase 5 theo plan gốc.
5. Admin: không có trang quản lý toàn bộ user để unban/unsuspend ngoài luồng report — xem mục giới hạn đã biết ở trên.
6. `docs/design-guidelines.md` lệch so với code thực tế (primary color, sidebar width...) — không đụng, thuộc docs-impact rule (không phải behavior change, và nằm ngoài yêu cầu Phase 3).

## Unresolved Questions

1. M5 (iOS reaction tap): logic đã đổi đúng theo gợi ý audit (`onPointerEnter` + `pointerType==='mouse'`), nhưng chưa test trên iPhone thật — cần xác nhận trên thiết bị.
2. Explore giới hạn 30 ngày (câu hỏi mở từ audit gốc, không phải việc của Phase 3) — vẫn mở, cần quyết định sản phẩm.

Status: DONE
Summary: Đã sửa đủ 5 High + các Medium trong 12 mục tối thiểu (follow/bookmark state, tab Following skeleton/error, font subset+display=block, N+1 reaction batch, comment IME/dedupe/pagination, mobile sticky/toast/iOS-tap, login next xuyên cả OAuth, socket lazy-connect, SEO JSON-LD/canonical, admin suspend/ban/xoá-có-lý-do/khôi-phục); typecheck+build backend/frontend sạch, 146/146 backend test pass trên server, không chạy gì trên Mac.
