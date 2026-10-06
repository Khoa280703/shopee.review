# Audit Frontend: UX / Perf / A11y / Code clean / SEO — shopee.review

Ngày: 2026-10-06. HEAD `983a01e` (= production). Phạm vi: `apps/frontend/src` (90 file, ~6.9k LOC). Chỉ đọc, không sửa code.
Phương pháp: đọc toàn bộ source FE + đối chiếu contract backend (`social.service.ts`, `posts.service.ts`, `users.service.ts`, `scraper.service.ts`). `tsc --noEmit` PASS (0 lỗi). Không có ESLint config -> `pnpm lint` thực chất chỉ chạy tsc. 0 test FE.

## Tổng quan

Nền tảng đã tốt hơn nhiều so với audit 07/2026: toast, i18n vi/en đủ key (0 key thiếu, 0 key lệch), dark mode bằng token CSS-var, không còn `any`, chuyển sang react-query cho feed/reaction/follow. Phần lớn lỗi còn lại là **lỗi trạng thái mà người dùng nhìn thấy ngay** (nút follow/bookmark hiện sai, tab Following luôn hiện "trống"), **2 vấn đề font ảnh hưởng mọi trang**, và **thiếu nhất quán về pattern** (4 kiểu phân trang, 3 kiểu optimistic update, 5 bản copy auth-guard), làm chậm việc phát triển tính năng mới.

---

## Critical
Không có. Không thấy lỗi trust-boundary ở FE (JSON-LD đã escape `<`, `next` redirect chặn `//`, middleware fail-closed).

## High (người dùng cảm nhận được ngay)

### H1. Nút Follow trên trang profile hiện sai trạng thái và có thể "kẹt"
- `components/user/user-profile-header.tsx:18-28,39` + `components/social/follow-button.tsx:34-42`.
- SSR gọi `usersApi.profile(username, true)` không kèm cookie -> `isFollowing` luôn `false`. `FollowButton` nhận `initialFollowing=false` -> seed cache với `initialData:false, staleTime: Infinity`. Sau đó header refetch client và `setFollowing(true)`, nhưng `initialData` chỉ áp dụng lần tạo cache đầu tiên và staleTime Infinity nên query không bao giờ chạy lại -> nút vẫn hiện "Theo dõi" dù đã follow. Bấm vào thì gửi follow lần nữa, muốn unfollow phải bấm 2 lần.
- Fix: bỏ hẳn prop `initialFollowing` ở trang profile (để `FollowButton` tự fetch `followStatus` như trang post detail), xoá effect refetch cả profile trong header. Hoặc sau khi refetch thì gọi `queryClient.setQueryData(['followStatus', username], p.isFollowing)`.

### H2. Bookmark trên trang chi tiết luôn hiện "chưa lưu", lần bấm đầu có thể bỏ lưu
- `app/[username]/[postId]/page.tsx:209` truyền `<BookmarkButton postId>` mà không có `initialBookmarked`, `bookmark-button.tsx:14,22` mặc định `false`. Backend `PUT /posts/:id/bookmark` là **toggle** (`social.service.ts:246-267`). Bài đã lưu thì hiện icon rỗng; bấm vào -> optimistic hiện đã lưu -> server bỏ lưu -> trả `false` -> icon rỗng lại. Người dùng thấy "bấm không ăn" và mất bookmark mà không biết.
- Fix: thêm `GET /posts/:id/bookmark` (hoặc field `bookmarked` theo viewer) rồi dùng `useQuery(['bookmark', postId])` giống ReactionButton. Đổi API sang idempotent `PUT {bookmarked:boolean}` thay cho toggle để tránh lệch trạng thái.

### H3. Tab "Đang theo dõi" luôn hiện hộp "trống", không có loading/skeleton, lỗi bị che thành rỗng
- `components/post/home-feed-tabs.tsx:52-65`: hộp `followingEmptyTitle` + CTA "Khám phá" **luôn render dưới feed**, kể cả khi có bài.
- `components/post/load-more-posts.tsx:37-54,73`: không dùng `isLoading`/`isError`. Khi đang fetch, `posts=[]` -> `PostFeed` hiện `emptyList` ("Chưa có bài") rồi mới nhảy sang nội dung. Lỗi mạng cũng hiện "Chưa có bài". `PostFeedSkeleton` đã có sẵn (`post-grid.tsx:63`) nhưng không được dùng ở đâu.
- Fix: `if (isLoading) return <PostFeedSkeleton/>; if (isError) return <ErrorState onRetry={refetch}/>`, chỉ hiện CTA empty khi `!isLoading && posts.length===0`. Thêm prop `emptyState` cho `LoadMorePosts`.

### H4. Font: tải Material Symbols bản full variable, và class token `font-*` trỏ sai tên font Inter
- `app/globals.css:1`: `@import` Google Fonts **toàn bộ trục** `opsz 20..48, wght 100..700, FILL 0..1, GRAD -50..200`. Đây là file font icon cỡ vài MB, nằm trong `@import` của CSS nên chặn render theo chuỗi, kèm `display=swap` -> trên mobile sẽ thấy chữ "favorite", "chat_bubble"... nháy lên rồi mới thành icon (FOUT + layout shift). Mọi trang đều dính vì icon có khắp nơi.
  - Fix: chỉ giữ trục thật sự dùng (`FILL@0..1`, `wght 400`, `opsz 24`) và thêm `&icon_names=home,search,...` (Google Fonts hỗ trợ subset icon cho Material Symbols), `display=block`, chuyển sang `<link rel="preconnect">` + `<link>` trong layout, hoặc self-host bản subset.
- `tailwind.config.ts:90-99`: `fontFamily['headline-md'|'body-md'|...]: ['Inter']`, nhưng `next/font` (`layout.tsx:17`) đăng ký font với tên đã hash (`__Inter_xxx`), chỉ expose qua `--font-inter`. Có 97 chỗ dùng `font-headline-md/body-md/...`; các class này sinh `font-family: Inter` không kèm fallback -> trên máy/điện thoại không cài sẵn Inter sẽ rơi về font mặc định của trình duyệt (thường là serif).
  - Fix: `fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'], 'headline-md': ['var(--font-inter)', 'system-ui', 'sans-serif'], ... }`. **Cần xác nhận** bằng DevTools > Computed > Rendered font trên một máy không có Inter.

### H5. N+1 request reaction trên feed (phần còn mở của FE-M3)
- `components/social/reaction-button.tsx:84-93`: mỗi `PostFeedCard` khi đã đăng nhập gọi riêng `GET /posts/:id/reactions/me`. Một trang 20 bài = 20 request, mỗi lần infinite scroll thêm 20. Trên 3G thì tim/số đếm "nhảy" muộn.
- Fix: backend trả kèm `viewerReaction` + `reactionCounts` trong payload feed/explore/user-posts (hoặc thêm endpoint batch `GET /reactions/me?ids=1,2,3`), sau đó seed cache bằng `queryClient.setQueryData(['reactionStatus', id], ...)` trong `LoadMorePosts`.

---

## Medium

### UX / tính đúng

| # | Vấn đề | Bằng chứng | Fix |
|---|---|---|---|
| M1 | Nhấn Enter trong comment khi đang gõ IME (bộ gõ tiếng Việt của macOS, Telex có marked text) sẽ gửi ngay chữ chưa gõ xong. Ngoài ra không có cờ pending nên Enter lặp hoặc vừa Enter vừa click sẽ tạo comment trùng | `comments-section.tsx:90,230` | `if (e.key==='Enter' && !e.nativeEvent.isComposing && !submitting)`, thêm state `submitting` và disable nút |
| M2 | Race socket với HTTP: backend emit `comment:new` **trước** khi trả response (`social.service.ts:400`). Hàm `addTopComment`/`reply` thêm vào state mà không dedupe theo id -> comment/reply bị lặp, `replyCount` +2, React báo trùng key | `comments-section.tsx:160,175-185` vs dedupe chỉ có ở `use-comment-socket.ts:29,36` | Dùng chung một hàm `upsertComment` có dedupe theo id cho cả HTTP lẫn socket |
| M3 | Reply lỗi vẫn xoá chữ và đóng ô: `onReply` nuốt lỗi nên `submitReply` cứ thế clear. Lỗi hiện ở đầu section, cách xa ô reply | `comments-section.tsx:41-46,186-188` | `reply()` re-throw hoặc trả `boolean`, chỉ clear khi thành công, hiện lỗi inline |
| M4 | Comment cấp 1 chỉ load trang đầu, `nextCursor` bị bỏ qua -> bài nhiều comment thì người dùng không xem được phần còn lại | `comments-section.tsx:140-147` | Lưu cursor và thêm nút "Xem thêm bình luận" (hoặc dùng `useInfiniteQuery`) |
| M5 | Trên iOS, `onMouseEnter` mở picker cảm xúc ngay lúc tap; theo heuristic "content change" của Safari, click sẽ bị nuốt -> tap tim lần đầu chỉ mở picker, không like. Cần kiểm thử trên máy thật. Bàn phím thì không mở được picker | `reaction-button.tsx:156,182` | Chỉ mở picker khi `onPointerEnter` có `e.pointerType==='mouse'`. Thêm nút/phím (ArrowUp) để mở picker, `aria-pressed`, `aria-haspopup` |
| M6 | Tab sticky bị header mobile che: header `sticky top-0 z-30` cao 56px, còn tab feed và header trang Thông báo cũng `sticky top-0` nhưng z thấp hơn -> trượt xuống dưới header và mất khi cuộn | `header.tsx:22`, `home-feed-tabs.tsx:41`, `notifications/page.tsx:53` | `top-14 lg:top-0` |
| M7 | Đã đăng nhập vẫn thấy nháy UI "chưa đăng nhập": `AuthProvider` chỉ fetch `/auth/me` ở client; `HomeFeedTabs` không check `loading` nên `/?tab=following` hiện CTA "Đăng nhập" ~1 RTT; header/avatar trống | `auth-context.tsx:18-43`, `home-feed-tabs.tsx:28,52` | Ngắn hạn: render skeleton khi `loading`. Dài hạn: layout đọc cookie, gọi `/auth/me` server-side (forward cookie) rồi truyền `initialUser` |
| M8 | Login từ hành động client làm mất ngữ cảnh: like/follow/bookmark/comment/CreatePrompt/MobileNav/auth-guard client đều `push('/auth/login')` không kèm `next`, register và OAuth callback luôn về `/` | `reaction-button.tsx:119`, `bookmark-button.tsx:27`, `follow-button.tsx:60`, `comments-section.tsx:153,169`, `create-post-prompt.tsx:16`, `mobile-nav.tsx:34`, `saved/page.tsx:26`, `register/page.tsx:33`, `auth/callback/page.tsx:14` | Thêm helper `loginHref(pathname)` dùng chung; register và OAuth `state` cũng mang theo `next` |
| M9 | Không có UI sửa/xoá bài của chính mình: `postsApi.update/remove` có nhưng không component nào gọi | `lib/api.ts:151-153` (grep: 0 caller) | Thêm menu "..." trên post detail khi `user.id===post.userId` |
| M10 | Lỗi bị che thành "trống" (phần còn mở của FE-M7): profile posts, category, dashboard (chart hiện "Đang tải" **mãi**), admin, danh sách thông báo | `[username]/page.tsx:52-62`, `category/[slug]/page.tsx:17-31`, `dashboard/page.tsx:28-30,50`, `admin/page.tsx:20`, `use-notifications.ts:24-34` | Dùng chung component `ErrorState` có nút retry. SSR thì phân biệt `loadFailed` như `app/page.tsx:24-35` |
| M11 | Mutation không có `catch` (phần còn mở của FE-M1): lỗi bị nuốt, người dùng không nhận phản hồi, sinh unhandled rejection | `admin/page.tsx:32-40`, `settings/page.tsx:56-76` (unblock/revoke/avatar), `block-button.tsx:19-32`, `saved/page.tsx:40-50`, `forgot-password/page.tsx:16-26`, `comments-section.tsx:191-205`, `use-notifications.ts:85-101`, `follow-button.tsx:53-55` (rollback nhưng không toast) | `catch -> toast(t('...error'),'error')`. Gom vào `useMutation` + `onError` toast mặc định ở QueryClient (`mutationCache.onError`) |
| M12 | Trang Thông báo: không có trạng thái loading (hiện "Không có thông báo" trước khi data về), không phân biệt mục chưa đọc (`n.read` không dùng), lọc tab trên data đã load nên tab LIKE có thể trống trong khi còn trang sau | `notifications/page.tsx:47,77-80,117` | Thêm `loading`, nền nổi bật cho `!n.read`, lọc qua param API hoặc hiện "Xem thêm" ở mọi tab |
| M13 | Form tạo bài: (a) scrape cũ có thể ghi đè kết quả mới (không abort hay check URL); (b) `productMeta` không được xoá khi đổi/xoá URL -> có thể đăng giá/shop của sản phẩm khác; (c) `applyScraped` dùng `title` cũ trong closure; (d) poll 30s vẫn chạy sau unmount; (e) không cảnh báo khi rời trang lúc đang có nháp | `shopee-url-input.tsx:22-39`, `post-form.tsx:36-47`, `api.ts:135-147` | Dùng `AbortController` + so sánh `latestUrlRef`; reset `productMeta` trong `onChange`; `setTitle(t => t \|\| data.title)`; `beforeunload` khi dirty |
| M14 | Upload ảnh tuần tự, nếu ảnh thứ N lỗi thì N-1 ảnh đã upload bị bỏ (không `onChange`); không check dung lượng hay nén ảnh client (ảnh điện thoại 5-12MB); input không reset nên không chọn lại được cùng một file | `image-uploader.tsx:28-39,82` | `Promise.allSettled` với concurrency 3 và giữ ảnh thành công; resize về khoảng 2048px bằng canvas trước khi upload; `e.target.value=''` |
| M15 | Message lỗi từ backend (tiếng Việt, ví dụ `'Không tìm thấy bài viết'`) và từ `api.ts` được hiện thẳng ra UI -> người dùng locale `en` thấy tiếng Việt | `api.ts:42,144,147,315`; hiển thị raw ở `login:39`, `register:35`, `reset:36`, `post-form:75`, `settings:87,103`, `image-uploader:36` | Map theo `status`/`code` sang key i18n (`errors.http.409`...). Backend trả `code` máy đọc được |
| M16 | Infinite scroll gặp lỗi sẽ lặp request: lỗi -> `isFetchingNextPage=false` -> effect tạo observer mới -> observer báo intersecting ngay -> `fetchNextPage` tiếp. Không có UI lỗi trang sau, không có "Đã hết bài" | `load-more-posts.tsx:56-69,74-78` | Dừng khi `isFetchNextPageError`, hiện nút "Thử lại" và dòng kết thúc |
| M17 | Explore phân trang bằng OFFSET trên điểm số thay đổi liên tục, mỗi trang lại cache Redis riêng (`posts.service.ts:213-258`) -> trùng hoặc sót bài giữa các trang, React trùng `key=post.id` | `load-more-posts.tsx:54` | FE: dedupe theo id khi `flatMap`. BE: snapshot (cache danh sách id theo phiên) hoặc keyset theo `(score,id)` |
| M18 | Search: không bỏ qua kết quả cũ (gõ nhanh hay back/forward thì kết quả về lệch thứ tự); input không đồng bộ khi URL đổi; không phân trang | `search/page.tsx:20-44` | `useQuery(['search', q])` (tự xử lý race); `useEffect(()=>setQuery(initialQ),[initialQ])` |
| M19 | Toast nằm đè bottom nav mobile (`bottom-4` < nav cao 64px) | `toast-provider.tsx:34` vs `mobile-nav.tsx:25-26` | `bottom-20 lg:bottom-6`. Toast lỗi nên dùng `role="alert"`, và vùng live nên tồn tại sẵn trước khi chèn nội dung |

### Performance

| # | Vấn đề | Bằng chứng | Fix |
|---|---|---|---|
| P1 | Mọi visitor (kể cả ẩn danh, mọi trang) đều mở kết nối Socket.io dù chỉ trang post detail dùng -> tải server WS + pin mobile | `socket-provider.tsx:12-19`, `socket.ts:12-23` (`autoConnect:true`) | `autoConnect:false`; `useCommentSocket` gọi `connect()` khi join, đếm số room và disconnect khi về 0 |
| P2 | Profile gọi backend 3 lần mỗi lượt xem: `generateMetadata` + page (fetch không cache, không `cache()`) + client refetch toàn bộ profile chỉ để lấy `isFollowing` | `[username]/page.tsx:20,44`, `user-profile-header.tsx:21-28` | Bọc `const getProfile = cache((u)=>usersApi.profile(u,true))`; bỏ refetch client (xem H1) |
| P3 | SSE thông báo bỏ cuộc vĩnh viễn sau 5 lần thử (khoảng 15s). Laptop sleep hay mất mạng ngắn là realtime chết im lặng tới khi reload | `use-notifications.ts:44-73` | Reset bộ đếm khi có `online`/`visibilitychange`; dùng exponential backoff thay vì giới hạn cứng; phân biệt 401 bằng cách gọi `/auth/me` |
| P4 | Không có phản hồi khi điều hướng sang route SSR (post detail, profile, home): chỉ `category/[slug]` có `loading.tsx` (phần còn mở của FE-M5) | `app/category/[slug]/loading.tsx` duy nhất | Thanh tiến trình toàn cục dùng `useLinkStatus` (Next 15.3+) hoặc `loading.tsx` ở `[username]` (chấp nhận soft-404 có `noindex`). `MobileNav` đang dùng `<button>+router.push` nên mất prefetch, cần đổi sang `<Link>` (`mobile-nav.tsx:30-38`) |
| P5 | Không có ESLint, nên không có `react-hooks/exhaustive-deps`, `jsx-a11y`, `@next/next/*` | `package.json:98` (`next lint \|\| tsc`), không có `eslint.config.*` | Thêm `eslint.config.mjs` với `next/core-web-vitals` + `jsx-a11y`, đưa vào CI |

### SEO

| # | Vấn đề | Bằng chứng | Fix |
|---|---|---|---|
| S1 | JSON-LD `reviewRating` dùng **rating của shop/sản phẩm trên Shopee** (`scraper.service.ts:65` shopRating -> `post-form.tsx:44 rating`), không phải điểm của người review. Đây là structured data gây hiểu nhầm (vi phạm guideline review snippet của Google) | `[username]/[postId]/page.tsx:94-96` | Bỏ `reviewRating` cho tới khi có field rating riêng của reviewer, hoặc chuyển sang `itemReviewed.aggregateRating`. Thêm `reviewBody`, `image`, `url` |
| S2 | Canonical dùng `username` lấy từ URL: `/bat-ky-ai/123` vẫn render bài và canonical trỏ tới URL sai, gây nội dung trùng lặp | `[username]/[postId]/page.tsx:26,37` | Canonical = `/${post.user.username}/${post.id}`; ở page thì `permanentRedirect` khi username không khớp |
| S3 | Sitemap chỉ có 50 bài mới nhất, không có profile và category (phần còn mở của P3) | `sitemap.ts:12` | Sitemap index phân trang (`generateSitemaps`) + profile + category |
| S4 | Thiếu metadata: category page không có `generateMetadata`; profile không có canonical/OG image; search (client) không có `noindex`; robots không chặn `/saved,/notifications,/admin,/auth` | `category/[slug]/page.tsx`, `[username]/page.tsx:12-28`, `robots.ts:9` | Bổ sung theo từng route |

---

## Accessibility (Medium/Low)

- **Medium**: input chỉ có placeholder, không có `<label>` hay `aria-label`: login/register/forgot/reset, ô comment, ô search, search ở right-sidebar. Label trong post-form và settings không gắn `htmlFor`. Login/register thiếu `autoComplete` (`email`, `current-password`, `new-password`, `username`) nên password manager hoạt động kém. Ví dụ `login/page.tsx:50-63`, `register/page.tsx:46-56`, `post-form.tsx:90-145`, `settings/page.tsx:169-184`, `right-sidebar.tsx:38-41`, `comments-section.tsx:227-233`.
- **Medium**: dialog chưa đạt chuẩn. `ReportDialog` thiếu `role="dialog"`, `aria-modal`, Esc, focus trap (vẫn mở từ P3). Lightbox không trap/restore focus, không khoá scroll body, không có phím mũi tên, aria-label "Previous"/"Next" hardcode tiếng Anh. `report-dialog.tsx:34-41`, `image-carousel.tsx:120-158`.
- **Low**: toggle không có `aria-pressed` (reaction, bookmark, follow); tab không có `role=tablist/tab` + `aria-selected` (home, profile, settings, notifications, search); nav không có `aria-current="page"` (`sidebar-nav.tsx:52`, `mobile-nav.tsx:30`); nút icon không có label (xoá ảnh `image-uploader.tsx:54`, thumbnail gallery `image-carousel.tsx:109`); link click-count `open_in_new` chỉ đọc lên con số (`post-feed-card.tsx:157-164`).
- **Low**: màu `text-outline` (#8F7069) trên nền trắng đạt khoảng 4.48:1, dưới mức AA cho chữ nhỏ (TimeAgo 12px ở `notifications/page.tsx:111`, footer sidebar).
- **Low dark mode**: hardcode `bg-white` ở thumbnail sản phẩm (`post-feed-card.tsx:122`, `right-sidebar.tsx:60`) tạo ô trắng chói trong dark mode. Class `font-title-md text-title-md` không tồn tại trong config, nên h2 ở settings không có style (`settings/page.tsx:198,227,253,293`).

## Code cleanliness (Medium/Low): cần dọn trước khi thêm tính năng

1. **Pattern data-fetching không thống nhất (Medium)**: react-query (feed, reaction, follow) song song với `useEffect`+`useState` tự viết (saved, notifications, comments, search, dashboard, admin, settings). Có 4 cách phân trang và 3 cách optimistic (bookmark useState, follow/reaction useMutation, block không optimistic). Đề xuất: chuẩn hoá về `useInfiniteQuery`/`useMutation`, đặt query-key factory trong `lib/query-keys.ts`, toast lỗi mặc định qua `MutationCache`.
2. **Auth-guard client bị copy 5 lần (Medium)** trong create/saved/settings/dashboard/admin, trùng với middleware đã bảo vệ các route này. Làm thêm 1 lần render "Đang tải..." và làm mất `next`. Nên bỏ, tin vào middleware. Riêng admin thì gate thêm `isAdmin`.
3. **`settings/page.tsx` 330 dòng (>300) với 17 `useState` (Medium)**: tách `ProfileSettingsForm`, `SecuritySettings`, `PrivacySettings`, `DangerZone`. Đưa tab vào URL (`?tab=security`).
4. **Component trùng lặp (Low-Medium)**: markup empty/error state (`rounded-xl border border-dashed ... py-16 text-center`) xuất hiện khoảng 10 lần, nên tạo `EmptyState`/`ErrorState`. Hiển thị giá + card sản phẩm lặp 3 lần (post detail, `PostFeedCard`, `PostCard`) trong khi `PriceDisplay` lại không được dùng. Tab bar lặp 5 lần. Fallback avatar viết lại ở `right-sidebar.tsx:91-103` thay vì dùng `Avatar`. Header profile render 2 bản (mobile/desktop), làm mount gấp đôi Follow/Block/Report (`user-profile-header.tsx:48-128`).
5. **Dead code (Low)**: `ImageCarousel` (`image-carousel.tsx:10-52`), `PostGridSkeleton`/`PostFeedSkeleton` (không dùng, nên dùng cho H3), `components/ui/badge.tsx`, `components/ui/card.tsx`, `components/shared/price-display.tsx`, source `type:'posts'` trong `load-more-posts.tsx:12`, tham số `onReactionUpdate` (`use-comment-socket.ts:15`), `notificationsApi.markRead`, 6 key i18n không dùng (`common.close/follow/save/submit`, `nav.explore/feed`).
6. **Type/API (Low)**: `create(data: Partial<Post>)` (`api.ts:149`) cho phép gửi `likeCount`/`id`, nên có type `CreatePostInput`. `ProductMeta` có index signature `[key:string]:unknown` làm yếu type. Bẫy override header trong `apiFetch` vẫn còn (`api.ts:28-36`, `...init` ghi đè `headers` đã merge). Comment "detail overrides to 5m" trong `query-client.ts:8` sai sự thật. `formatNumber` không theo locale (`format.ts:9-13`). Icon lẫn `lucide-react` (forms) với Material Symbols (phần còn lại).
7. **Re-render nhỏ (Low)**: mỗi `TimeAgo` có `setInterval` riêng (`time-ago.tsx:15-18`), feed 100 bài là 100 timer; nên dùng 1 ticker chung qua context. Layout truyền **toàn bộ** messages xuống client (`layout.tsx:43,47`), nên chỉ truyền các namespace client cần.
8. **i18n hardcode (Low)**: `global-error.tsx:12-16` (vi, `lang="vi"`), `image-carousel.tsx:139,147` (en), `click-chart.tsx:22` (`clicks`), `api.ts:144,147,315` (vi), admin hiện enum thô `r.reason`/`r.targetType` (`admin/page.tsx:60-61`), ngày trên chart `d.date.slice(5)` không localize.
9. **Docs lệch (Low)**: `docs/design-guidelines.md` ghi primary `#EE4D2D` và sidebar 240px có label, nhưng code dùng `--c-primary 178 34 4` (#B22204) và rail icon 72px. Cần cập nhật doc cho khớp.

---

## Đối chiếu audit 2026-07-16 (phần Frontend)

| ID | Trạng thái | Bằng chứng |
|---|---|---|
| FE-H1 notifications không mark read | **FIXED** | `notifications/page.tsx:39-45` (`hasMarked` ref + dep `unreadCount`) |
| FE-H2 ReportDialog báo thành công khi lỗi | **FIXED** | `report-dialog.tsx:22-31` (catch -> `error`, nút retry) |
| FE-H3 postId không phải số trả 500 | **FIXED** | `[username]/[postId]/page.tsx:29,72-73` |
| FE-M1 mutation không catch | **STILL OPEN (một phần)** | comments đã sửa (`comments-section.tsx:157-218`). Còn: `admin/page.tsx:32-40`, `settings/page.tsx:56-76`, `block-button.tsx:19-32`, `saved/page.tsx:40-50`, `forgot-password/page.tsx:16-26`, `comments-section.tsx:191-205` |
| FE-M7 lỗi fetch hiện như rỗng | **STILL OPEN (một phần)** | home/search/saved đã sửa. Còn: profile, category, `LoadMorePosts` (feed/following), notifications, dashboard, admin (M10, H3) |
| FE-M2 badge verified hardcode | **FIXED** | `post-feed-card.tsx:41` gate theo `post.user.verified`; backend select `u.verified` (`posts.service.ts:236`) |
| FE-M3 ReactionButton initialData | **FIXED (tính đúng)** / **STILL OPEN (N+1)** | `reaction-button.tsx:84-93` đã dùng placeholderData; N+1 xem H5 |
| FE-M4 hydration mismatch timeAgo | **FIXED** | `time-ago.tsx:20` `suppressHydrationWarning` + next-intl formatter |
| FE-M5 không có loading.tsx | **STILL OPEN (một phần)** | chỉ có `category/[slug]/loading.tsx` (P4) |
| FE-M6 login bỏ `?next=` | **FIXED với route middleware** / **STILL OPEN với redirect client** | `middleware.ts:42`, `login/page.tsx:24-37`; còn lại xem M8 |
| P3: /admin chỉ guard ở client | **STILL OPEN (chấp nhận được)** | middleware chỉ check đăng nhập (`middleware.ts:7`), `isAdmin` check ở client (`admin/page.tsx:25`); backend vẫn enforce |
| P3: ReportDialog thiếu focus-trap/Esc | **STILL OPEN** | `report-dialog.tsx:34-41` |
| P3: poll scrape không huỷ khi unmount | **STILL OPEN** | `api.ts:135-147` không có AbortSignal |
| P3: sitemap thiếu profile | **STILL OPEN** | `sitemap.ts:6-22` |
| P3: host ảnh demo trong remotePatterns prod | **STILL OPEN** | `next.config.ts:158-162` |
| P3: react-query-devtools trong dependencies | **STILL OPEN (không đáng kể)** | `package.json:107`; runtime đã gate dev (`query-provider.tsx:12`) |
| P3: nút tự follow chính mình trên bài của mình | **FIXED** | `follow-button.tsx:28,66` |
| P3: bẫy override header trong apiFetch | **STILL OPEN** | `api.ts:28-36` |
| P3: nút settings chết / ImageCarousel | settings **FIXED** (đã tách tab, không còn nút chết); `ImageCarousel` **STILL OPEN** (dead) | `image-carousel.tsx:10-52` |
| Cross-cutting: 0 test FE / e2e | **STILL OPEN** | `package.json:101` `"test": "pnpm typecheck"` |

---

## Recommended Actions (ưu tiên theo cảm nhận người dùng)

1. H1 + H2: sửa trạng thái Follow/Bookmark (khoảng nửa ngày, cần 1 endpoint BE cho bookmark status).
2. H3 + M16 + M10: `LoadMorePosts` có skeleton/error/retry/end; bỏ hộp empty luôn hiện; dùng chung `EmptyState/ErrorState`.
3. H4: subset Material Symbols + sửa `fontFamily` sang `var(--font-inter)` (khoảng 1 giờ, tác động lên mọi trang).
4. M1-M4: luồng comment (IME, pending, dedupe, giữ chữ khi lỗi, phân trang).
5. M6 + M19 + M5: các lỗi layout mobile (sticky dưới header, toast đè nav, picker trên iOS).
6. H5 + P1 + P2: giảm request (reaction batch, socket lazy, `cache()` profile).
7. M8 + M9 + M13 + M14: login quay lại đúng trang; sửa/xoá bài; độ bền của form tạo bài.
8. S1 + S2: JSON-LD rating và canonical.
9. Dọn code: ESLint (jsx-a11y, react-hooks), chuẩn hoá react-query, tách settings, xoá dead code.
10. Smoke e2e (Playwright): login -> post -> react -> comment -> bookmark -> follow (đúng những luồng đang có bug ở trên).

## Metrics
- Type: `tsc --noEmit` 0 lỗi; 0 `any` / `@ts-ignore` / `eslint-disable`.
- Lint: không có cấu hình ESLint (0 rule chạy).
- Test FE: 0.
- i18n: vi/en 100% khớp key, 0 key thiếu, 6 key không dùng; khoảng 10 chuỗi hardcode.
- File >300 dòng: `settings/page.tsx` (330), `lib/api.ts` (317).

## Unresolved Questions
1. H4 (Inter): cần xác nhận bằng DevTools trên thiết bị không cài Inter. Nếu đã thấy font serif trên điện thoại thì đây chính là nguyên nhân.
2. M5 (picker iOS): cần thử trên iPhone thật; heuristic content-change của Safari có thể khác theo phiên bản.
3. Bookmark: giữ API toggle hay chuyển sang idempotent `PUT {bookmarked}`? (ảnh hưởng contract BE)
4. Explore giới hạn 30 ngày (`posts.service.ts:225`): site ít hoạt động thì tab "Dành cho bạn" sẽ cạn bài. Đây có phải ý đồ sản phẩm?
5. Chủ bài có được xoá comment trên bài của mình không? Hiện chỉ tác giả comment mới xoá được (`comments-section.tsx:78`).
6. Hiển thị sao trên card sản phẩm ở post detail là rating của shop. Có cần ghi rõ "Đánh giá Shopee" để không bị hiểu là điểm của reviewer?
