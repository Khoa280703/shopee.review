# Backend Audit — apps/backend/src (NestJS)

Ngày: 2026-10-06 · HEAD 983a01e · Read-only (không sửa source, không commit)
Phương pháp: đọc toàn bộ ~6.5k LOC của 120 file `.ts` trong `apps/backend/src`, schema và migrations Prisma, cùng các phần nginx/compose/frontend liên quan để xác định trust boundary. Các claim quan trọng đã được kiểm chứng trực tiếp trên runtime (compiled metadata trong `dist/`, source của `@nestjs/throttler` 6.5.0, type `CategoryUpdateInput` do Prisma generate, source `router-execution-context` của Nest).
Baseline: `tsc --noEmit` sạch; `vitest run` 84/84 pass (9 file). Repo không có e2e test cho backend.

---

## Tóm tắt

| Mức độ | Số lượng |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 10 |
| Low | 17 |

Phần lớn các finding cũ ở backend đã được fix đúng cách (xem bảng đối chiếu cuối báo cáo). Tuy vậy có **1 lỗ hổng Critical mới**: endpoint quản lý category vừa thiếu authz vừa bị mass-assignment qua Prisma nested writes. Bất kỳ user nào đã đăng nhập đều có thể tự nâng lên admin, chiếm tài khoản người khác hoặc đổi affiliate link của mọi bài viết.

---

## Critical

### C1. `/api/categories` (POST/PATCH/DELETE): thiếu AdminGuard, PATCH bỏ qua validation, dẫn tới leo thang đặc quyền và chiếm tài khoản
- Bằng chứng:
  - `categories/categories.controller.ts:15-31`: create/update/delete chỉ có `@UseGuards(JwtAuthGuard)`, **không có `AdminGuard`**. Mọi user đã login (kể cả email chưa verify) đều tạo, sửa, xoá được category.
  - `categories/categories.controller.ts:23`: `@Body() dto: Partial<CreateCategoryDto>`. `Partial<>` là type của TS nên bị erase lúc runtime. Metadata đã compile là `design:paramtypes [Number, Object]` (`dist/categories/categories.controller.js:59`), và `ValidationPipe` bỏ qua metatype `Object`, nên `whitelist` **không strip gì cả**.
  - `categories/categories.service.ts:17-19`: `prisma.category.update({ where:{id}, data: dto })` nhận nguyên body thô. Type Prisma đã generate cho thấy `CategoryUpdateInput.posts` hỗ trợ `connect | update | updateMany | deleteMany`, và `PostUpdateWithoutCategoryInput.user.update` cho phép ghi **mọi cột của User** (`isAdmin`, `passwordHash`, `email`, `tokenVersion`...).
- Exploit mẫu (chỉ suy ra từ type, KHÔNG chạy thử trên prod):
  - `PATCH /api/categories/1 {"posts":{"connect":[{"id":<postId nạn nhân>}]}}`, sau đó `PATCH /api/categories/1 {"posts":{"update":{"where":{"id":<postId>},"data":{"user":{"update":{"passwordHash":"<bcrypt của attacker>"}}}}}}`. Kết quả: chiếm tài khoản của bất kỳ ai có ít nhất 1 bài viết. Tương tự, set `isAdmin:true` lên chính mình để thành admin.
  - `{"posts":{"updateMany":{"where":{},"data":{"affiliateUrl":"https://s.shopee.vn/<attacker>"}}}}`: chiếm hoa hồng affiliate của toàn bộ bài trong category (tracker vẫn coi link này hợp lệ vì đúng host Shopee).
  - `{"posts":{"deleteMany":{}}}`: xoá hàng loạt bài viết.
- Fix (làm ngay, trước mọi việc khác):
  1. `@UseGuards(JwtAuthGuard, AdminGuard)` cho POST/PATCH/DELETE.
  2. Tạo `UpdateCategoryDto extends PartialType(CreateCategoryDto)` (từ `@nestjs/mapped-types`), thêm `@MaxLength` và `@Matches` cho slug.
  3. Ở service, map field tường minh: `data: { name: dto.name, slug: dto.slug, icon: dto.icon, sortOrder: dto.sortOrder }`. Không bao giờ truyền DTO thẳng vào `data`.
  4. Thêm audit log cho các thao tác category.
  5. Kiểm tra `admin_audit_logs`, `users.is_admin`, và các thay đổi `posts.affiliate_url`/`updated_at` gần đây trên prod để tìm dấu hiệu đã bị khai thác.
  6. Thêm test: PATCH với `posts` trong body phải trả 400 hoặc bị strip; user thường phải nhận 403.

---

## High

### H1. OAuth pre-account-hijack: liên kết Google/Facebook theo email vào tài khoản chưa verify, mật khẩu của attacker vẫn dùng được
- Bằng chứng: `auth/auth.service.ts:205-226` (Google) và `:239-260` (Facebook) dùng `findFirst({ OR: [{googleId}, {email}] })`. Nếu tìm thấy theo email thì `update({ googleId, emailVerified: true })` mà **không xoá `passwordHash`, không tăng `tokenVersion`, không xoá sessions**. `auth/strategies/google.strategy.ts:32-37` không kiểm tra `profile._json.email_verified`. `validateUser` (`auth.service.ts:186-193`) cho phép login dù email chưa verify.
- Kịch bản: attacker đăng ký trước bằng `victim@gmail.com` với mật khẩu của attacker (không cần verify). Sau đó nạn nhân "Đăng nhập bằng Google", tài khoản được link và đánh dấu verified. Từ đó attacker vẫn login được bằng mật khẩu, có toàn quyền và đăng bài được.
- Fix: khi link provider vào user có `emailVerified=false`, đặt `passwordHash=null`, `tokenVersion++`, `session.deleteMany`, hoặc từ chối auto-link và yêu cầu login bằng mật khẩu trước. Chỉ auto-link khi provider khẳng định email đã verified (Google `email_verified === true`). Với Facebook, không auto-link vào tài khoản đã có mật khẩu.

### H2. Bộ đếm rate-limit bị cộng 2 lần, mọi limit per-route thực tế chỉ còn khoảng một nửa (resend-verification chỉ còn 1 lần/15 phút)
- Bằng chứng: `app.module.ts:155` đăng ký `SmartThrottlerGuard` global. Các route sau **lại** thêm `@UseGuards(ThrottlerGuard)`: `auth/auth.controller.ts:54,66,99,108,125,136`, `posts/posts-me.controller.ts:27,39`, `social/reactions.controller.ts:51`, `moderation/reports.controller.ts:14`. `ThrottlerGuard.generateKey` (v6.5.0) = `sha256(Class-handler-name-tracker)`, nên cả hai guard increment **cùng một key** trong cùng storage, và mỗi request bị tính 2 lần.
- Tác động thực tế: register 5 thành 2 lần/15 phút, login 10 thành 5, resend-verification 3 thành **1**, tạo bài 10/h thành 5/h, scrape 20/h thành 10/h, report 20 thành 10. Người dùng thật gặp 429 sớm; các con số trong comment và tài liệu đều sai.
- Fix: bỏ toàn bộ `@UseGuards(ThrottlerGuard)` ở route level vì guard global đã đọc metadata `@Throttle`. Thêm test đếm số hit/request.

### H3. Metrics HTTP gán sai status cho mọi request lỗi, alert 5xx không bao giờ fire
- Bằng chứng: `metrics/http-metrics.interceptor.ts:38-47` đọc `res.statusCode` trong `finalize`. Nest gọi `setStatus(res, 200|201)` **trước** interceptor (`@nestjs/core/router/router-execution-context.js`, đoạn `setStatus` nằm trước `interceptorsConsumer.intercept`), còn exception filter chỉ set 4xx/5xx **sau** khi observable đã error. Kết quả là exception bị ghi nhận thành 200/201. Request bị guard từ chối (401/403/429) không đi qua interceptor nên không được đếm. Alert `monitoring/prometheus/alerts.yml:15` (`status=~"5.."`) vì vậy thực tế không hoạt động.
- Fix: dùng `catchError` để lấy `err.getStatus?.() ?? 500` rồi rethrow, hoặc chuyển sang express middleware `res.on('finish', ...)` (cách này cũng đếm được các request bị guard chặn và 404).

---

## Medium

### M1. Post và comment của user bị ban hoặc bị block vẫn hiển thị khắp nơi (finding L6 cũ, CHƯA fix)
- Bằng chứng: không có filter `bannedAt` hay block tại `posts/posts.service.ts:189-195` (findAll), `:203` (findOne), `:230-251` (explore), `:274-281` (search), `:301-312` (trending MV); `users/users.service.ts:100-118` (getUserPosts: profile trả 404 nhưng `/users/:username/posts` vẫn trả bài); `search/search.service.ts:81-84,108-121`; `social/social.service.ts:307-324` (comments). Điều này mâu thuẫn với README ("không thấy bài viết", "hồ sơ 404").
- Fix: thêm điều kiện chung `user: { bannedAt: null }` (Prisma) và `AND u.banned_at IS NULL` (raw SQL). Với viewer đã login thì loại thêm `getBlockedUserIds`. Ở `getUserPosts`, kiểm tra ban/block giống `findByUsername`.

### M2. Spam notification: mỗi lần re-react hoặc re-follow sinh thêm một row và một SSE push mới
- Bằng chứng: `social/social.service.ts:186-196`: toggle off rồi on lại sẽ tạo LIKE notification mới mỗi lần. `:68-72`: follow/unfollow lặp lại sẽ tạo FOLLOW mới. `notifications/notifications.service.ts:172` dùng `create` thuần, không có unique hay dedup. Giới hạn global là 300 req/phút/IP, đủ để spam hàng trăm thông báo mỗi phút vào một nạn nhân.
- Fix: thêm partial unique index `(recipient_id, actor_id, post_id, type) WHERE type IN ('LIKE','FOLLOW')` và dùng `createMany({skipDuplicates})` hoặc upsert (cập nhật `createdAt`, `read=false`). Hoặc dedup trong cửa sổ 24h, và chỉ push SSE khi thực sự insert.

### M3. Email phân biệt hoa/thường, dẫn tới trùng tài khoản, login hụt và bypass quy tắc link OAuth
- Bằng chứng: `schema.prisma:54` (`email String @unique`, không citext hay lower index); `auth/dto/register.dto.ts:12`, `login.dto.ts:4`, `forgot-password.dto.ts:4` không normalize; `auth.service.ts:155,187,291,362` dùng so khớp chính xác. `Victim@x.com` và `victim@x.com` là hai tài khoản riêng. Google luôn trả về email lowercase, nên sẽ tạo tài khoản thứ hai.
- Fix: thêm `@Transform(({value}) => value?.trim().toLowerCase())` cho mọi DTO có email. Migration: lowercase dữ liệu hiện có (xử lý trùng trước), rồi `CREATE UNIQUE INDEX ... ON users (lower(email))` hoặc chuyển cột sang `citext`.

### M4. forgot-password gửi mail đồng bộ: lộ qua timing (enumeration), lỗi gửi mail không retry được
- Bằng chứng: `auth/auth.service.ts:301` gọi `await this.mail.sendPasswordResetEmail` trực tiếp (gọi Resend API mất khoảng vài trăm ms) chỉ khi email tồn tại. Email verify thì lại đi qua queue (`:49-56`). Điều này phá tác dụng của cơ chế anti-enumeration ở `auth.controller.ts:103`.
- Fix: thêm `EMAIL_JOB.RESET` vào queue, trả response ngay. Nhánh không tồn tại và nhánh tồn tại cùng một code path.

### M5. Lỗi gửi mail bị nuốt, retry của BullMQ trở nên vô dụng
- Bằng chứng: `auth/mail.service.ts:38-40,65-67` dùng `catch` rồi chỉ log. `queue/queues/email.processor.ts:19` vì thế luôn "completed". `queue/queue.module.ts:49` (`attempts: 3`) không bao giờ được kích hoạt, nên mail verify bị mất trong im lặng.
- Fix: rethrow trong MailService (hoặc tạo biến thể `sendOrThrow` dùng cho processor) để BullMQ retry và giữ job failed lại để điều tra.

### M6. `productMeta` (giá, % giảm, shop, rating, đã bán) do client tự khai, có thể làm giả số liệu sản phẩm
- Bằng chứng: `posts/dto/create-post.dto.ts:30-32` (`@IsObject()` không có schema); `posts/posts.service.ts:332,354` lưu nguyên. Frontend render giá và shop từ field này (`apps/frontend/src/components/post/post-feed-card.tsx:20`, `[postId]/page.tsx:250-252`). Trên một nền tảng review, đây là rủi ro về tính toàn vẹn dữ liệu và lừa đảo. Ngoài ra không giới hạn kích thước JSON.
- Fix: server tự lấy `productMeta` từ `scraped_products` theo `normalizeShopeeUrl(productUrl)` và bỏ field này khỏi DTO. Nếu cần cho phép nhập tay, dùng DTO lồng nhau có kiểu (`@ValidateNested`) và đánh dấu `source:'manual'`.

### M7. `images` và `avatarUrl` chấp nhận URL bất kỳ, kể cả `http:`; upload không có throttle riêng và không yêu cầu verify email
- Bằng chứng: `posts/dto/create-post.dto.ts:34-37`, `users/dto/update-profile.dto.ts:14-16` chỉ dùng `@IsUrl()`, cho phép nhúng ảnh từ host bên thứ ba (tracking pixel, né pipeline sanitize EXIF, ảnh hỏng vì không nằm trong `remotePatterns`). `uploads/uploads.controller.ts:45-52` không có `@Throttle` (chỉ có backstop 300/phút) và không kiểm tra `emailVerified`, nên có thể spam lên R2 làm tăng chi phí. Upload "mồ côi" không bao giờ được dọn.
- Fix: validate bằng prefix `R2_PUBLIC_URL` (thêm danh sách CDN Shopee cho ảnh scrape) và `require_protocol + protocols:['https']`. Thêm `@Throttle({default:{limit:30,ttl:3600_000}})` cho upload và yêu cầu `emailVerified`.

### M8. Xoá tài khoản để lại dữ liệu rác trong search, counter lệch, R2 mồ côi, không cần xác thực lại
- Bằng chứng: `users/users.service.ts:149-154` chỉ gọi `user.delete`. Cascade xoá posts nhưng **không enqueue `INDEX_JOB.DELETE`** cho Meili. `followersCount`/`likeCount`/`commentCount` của người khác bị lệch đến lần reconcile 3h sáng. `users.controller.ts:42-51` không yêu cầu nhập lại mật khẩu, nên một token bị đánh cắp đủ để xoá vĩnh viễn tài khoản.
- Fix: lấy danh sách postId trước khi xoá rồi enqueue delete index. Giảm counter trong cùng transaction (follows, reactions, comments). Yêu cầu `currentPassword` (hoặc re-auth OAuth gần đây). Thêm job dọn object R2.

### M9. Playwright fallback chạy Chromium `--no-sandbox` trong container backend, các redirect trong trình duyệt không bị chặn (blind SSRF)
- Bằng chứng: `scraper/shopee-url-parser.ts:51-58` validate host **trước** khi goto, nhưng `scraper/shopee-playwright-fallback-scraper.ts:37` dùng `page.goto(productUrl)` và trình duyệt tự follow redirect, chạy JS, tải subresource tới bất kỳ host nào (bao gồm `redis:6379`, `db`, `169.254.169.254`). Ngoài ra `:46-51`: khi browser crash, `this.browser` vẫn trỏ vào instance đã chết, nên mọi fallback sau đó đều fail cho tới khi restart.
- Fix: dùng `page.route('**/*', r => isAllowedHost(r.request().url()) ? r.continue() : r.abort())` với allowlist `*.shopee.vn`, `*.susercontent.com`. Kiểm tra `browser.isConnected()` và relaunch khi cần, hoặc lắng nghe `browser.on('disconnected')`.

### M10. Retention xoá notifications bằng một câu DELETE duy nhất (DATA-M4 cũ mới fix một phần)
- Bằng chứng: `maintenance/retention.service.ts:78-85` dùng `notification.deleteMany` không batch, áp lên bảng fanout tăng trưởng nhanh nhất. Chỉ `click_logs` được batch (`:94-109`).
- Fix: tái dùng vòng lặp batch `DELETE ... WHERE id IN (SELECT id ... LIMIT 10000)` giống click_logs.

---

## Low

| # | Vấn đề | Bằng chứng | Fix |
|---|---|---|---|
| L1 | Tham số không phải số gây 500 (PrismaClientValidationError không phải KnownRequestError nên không được filter map) | `social/bookmarks.controller.ts:18` `Number(cursor)`; `social/follows.controller.ts:30-31,43-44` khiến `social.service.ts:115-116` nhận `take/skip = NaN`; `search/search.controller.ts:17` `page=0/-1/abc` dẫn tới offset âm hoặc NaN (`search.service.ts:107`, `meilisearch.service.ts:157`); `moderation/admin.controller.ts:37` `status` chưa được validate | Dùng `parsePageParams`; với `page` thì clamp `1..50`; `@Query('status', new ParseEnumPipe(ReportStatus, {optional:true}))` |
| L2 | Từ khoá search không giới hạn độ dài | `users/users.controller.ts:26`, `search/search.controller.ts:12`, `posts/dto/query-posts.dto.ts:22-24` | `@MaxLength(100)` hoặc cắt chuỗi; với trigram yêu cầu `q.length >= 2` |
| L3 | unfollow / bookmark-off / đổi loại reaction chạy đồng thời trả 404 thay vì idempotent (L2 cũ: hết 500 nhưng vẫn chưa idempotent) | `social/social.service.ts:84-101`, `:257-258`, `:215-218` | Dùng `deleteMany` hoặc `updateMany` trong interactive tx, chỉ giảm counter khi `count>0` |
| L4 | Click dedup kiểu read-then-write bị race (L5 cũ, CHƯA fix); UA và referer không giới hạn độ dài | `tracker/tracker.service.ts:36-66`; `schema.prisma` ClickLog `userAgent/referer String` | Dùng Redis `SET NX EX 3600` key `click:{postId}:{ip}` làm dedup; cắt UA và referer còn khoảng 400 ký tự |
| L5 | Token reset và verify lưu plaintext; reset không atomic (dùng token 2 lần đồng thời đều thành công) | `auth/auth.service.ts:165,295`, `schema.prisma:62,64`, `:305-322` | Lưu `sha256(token)`; `updateMany({where:{resetToken:hash, resetTokenExp:{gt:now}}})` và kiểm tra `count===1` |
| L6 | Thiếu `RESEND_API_KEY` thì link verify/reset (chứa token) bị log ra Loki | `auth/mail.service.ts:22,48` | Chỉ log khi `NODE_ENV!=='production'`; ở prod thì fail-fast |
| L7 | Register: user được tạo xong mới enqueue mail. Nếu Redis lỗi thì trả 500, lần thử lại nhận 409 | `auth/auth.service.ts:167-180` | Set cookie trước, dispatch mail best-effort (try/catch + log), hoặc dùng outbox |
| L8 | `getScrapeResult` không kiểm tra chủ sở hữu job; `failedReason` nội bộ bị trả cho client | `posts/posts.service.ts:418-438` | Lưu `userId` trong `job.data` rồi so khớp; map lỗi sang message chung |
| L9 | Scrape job lỗi validation (BadRequest) vẫn bị retry | `queue/queue.module.ts:57-58`, `scraper/shopee-url-parser.ts:52,64` | Ném `UnrecoverableError` của BullMQ cho lỗi input |
| L10 | Socket.io: client join không giới hạn số room; code auth trong handshake là dead code (frontend không gửi token, `client.data.userId` không được đọc ở đâu) | `social/social.gateway.ts:91-96`, `:40-75`; `apps/frontend/src/lib/socket.ts:12` | Giới hạn khoảng 20 room mỗi socket (`client.rooms.size`); xoá phần verify JWT hoặc dùng thật |
| L11 | SSE stream vẫn sống sau khi logout, ban hoặc revoke session; không giới hạn số stream mỗi user | `notifications/notifications.controller.ts:53-60`, `notifications.service.ts:195-213` | Kiểm tra lại session hoặc tokenVersion định kỳ trong heartbeat; giới hạn khoảng 5 stream/user |
| L12 | Reconcile thiếu `click_count`, `share_count`, `users.total_clicks` | `maintenance/reconciliation.service.ts:54-101` | Thêm UPDATE cho `total_clicks` = tổng `click_count` theo user |
| L13 | Admin listReports cứng `take:100`, không phân trang, nên report cũ hơn không bao giờ xem được | `moderation/reports.service.ts:52-59` | Dùng cursor qua `parsePageParams` |
| L14 | Thiếu username dành riêng: `saved` (route top-level của FE) và `me` (đụng `/users/me/...`) | `common/reserved-usernames.ts:1-27`; `apps/frontend/src/app/saved` | Thêm `saved`, `me`, `trending`, `following` và kiểm tra các user đã tồn tại |
| L15 | Logic cache scrape bị trùng (DRY) | `posts/posts.service.ts:440-459` và `queue/queues/scraper.processor.ts:28-53` | Processor gọi `PostsService.scrapeUrl` hoặc một helper chung |
| L16 | Dead code và dependency thừa: `isQueueEnabled`, `NotificationFanoutJob` (shape sai so với processor), enum `MENTION` chưa được implement (README lại quảng cáo), deps `@nestjs/serve-static` và `ioredis` không được import | `queue/queue.constants.ts:36-44`; `schema.prisma:18`; `apps/backend/package.json` | Xoá đi, hoặc implement mention; sửa README |
| L17 | Pattern không nhất quán: DTO khai inline trong controller; hàm `sessionMeta` khai giữa các khối import; 3 file trên 300 dòng | `posts/posts.controller.ts:7-25`, `moderation/admin.controller.ts:21-29`, `social/reactions.controller.ts:21-24`; `auth/auth.controller.ts:37-44`; `posts.service.ts` (460), `social.service.ts` (456), `auth.service.ts` (387) | Đưa DTO vào `dto/`; tách `social.service` thành follows/reactions/comments, `posts.service` thành query/scrape |

Ghi chú nhỏ, không xếp hạng: kết nối Redis ở `redis.module.ts` và `redis-io.adapter.ts` không `quit()` khi shutdown. CORS từ chối bằng `cb(new Error())` (`main.ts:59`) nên trả 500 thay vì không gửi header CORS. Feed `user.followers.some` cộng `ORDER BY id DESC` (`feed/feed.service.ts:49-61`) nên chạy `EXPLAIN` với user follow ít tài khoản để kiểm tra có bị quét ngược toàn bảng posts không (chưa xác minh được, nên không xếp hạng).

---

## Scout: edge cases đã kiểm tra
- `trust proxy` chỉ tin dải loopback/private và nginx dùng `proxy_add_x_forwarded_for` (`nginx/snippets/app-locations.conf:4`). Backend chỉ `expose` (không `ports`) (`docker-compose.yml:157-158`), nên giả định không có XFF tức là traffic nội bộ của `SmartThrottlerGuard` là hợp lệ. SSR của FE chỉ đọc (`apps/frontend/src/lib/api.ts:18`).
- Thứ tự exception filter: `APP_FILTER` (Sentry) được add trong `NestFactory.create`, còn `PrismaExceptionFilter` add sau. Sau `reverse()` thì Prisma filter được ưu tiên, nên P2002 trả 409 và P2025 trả 404 là đúng.
- Open redirect ở `/r/:postId`: host được validate theo allowlist, có kiểm tra `origin_link` lồng nhau và chống parameter pollution (`common/shopee-url.ts:67-90`). DTO `@IsUrl` chặn `javascript:`. Không phát hiện lỗi.
- Short-link SSRF: follow redirect thủ công, host allowlist được kiểm tra trước mỗi hop, có timeout (`scraper/shopee-url-parser.ts:29-47`). OK.
- Upload: sniff magic bytes, re-encode bằng sharp (xoá EXIF), có `limitInputPixels`, GIF bị chặn kích thước (`uploads/*`). OK, chỉ còn thiếu throttle (M7).
- Authz/IDOR: post update/delete (`posts.service.ts:385-396`), comment delete (`social.service.ts:412-422`), session revoke (`auth.service.ts:132-138`), notification markRead (`notifications.service.ts:231-240`) đều kiểm tra ownership. Admin routes có `JwtAuthGuard + AdminGuard`, và `isAdmin` được đọc từ DB mỗi request. **Ngoại lệ duy nhất: categories (C1).**
- JWT: secret dùng `getOrThrow`, có kiểm tra `tokenVersion`, `bannedAt`, session `sid` mỗi request (`jwt.strategy.ts:37-73`). WS handshake có kiểm tra tương đương.

---

## Đối chiếu finding cũ (chỉ phần backend)

### production-readiness-audit-260716-1558
| ID | Trạng thái | Bằng chứng |
|---|---|---|
| DATA-C1 connection_limit=1 | FIXED | `docker-compose.yml:117` `connection_limit=15` |
| INFRA-H1/DATA-H1 graceful shutdown | FIXED | `main.ts:75` `enableShutdownHooks()`; `apps/backend/Dockerfile:33` `exec node` |
| INFRA-H3 ADMIN_TOKEN mặc định + so sánh không constant-time | FIXED | `docker-compose.yml:125` `${ADMIN_TOKEN:?}`; `queue/bull-board-auth.ts:5-10` `timingSafeEqual` |
| INFRA-H4 /metrics public | FIXED (nginx) | `nginx/snippets/app-locations.conf:98-102` chỉ allow 127.0.0.1 |
| DATA-H2 Feed không degrade khi Redis lỗi | FIXED | `feed/feed.service.ts:26-42` |
| DATA-M1 fanout không idempotent | FIXED | migration `20260716120000.../migration.sql` partial unique `notifications_new_post_uniq` + `skipDuplicates` (`notification.processor.ts:44-52`) |
| DATA-M2 Meili drift vĩnh viễn | PARTIAL | Có `POST /api/search/reindex` admin (`search/search.controller.ts:21-26`); chưa có cron reconcile tự động, và xoá user không xoá doc (M8) |
| DATA-M3 deleteCommentCore đếm ngoài tx | FIXED | `social/social.service.ts:441-450` |
| DATA-M4 retention không batch | PARTIAL | click_logs đã batch (`retention.service.ts:94-109`); notifications chưa (M10) |
| DATA-M5 getPostStats không giới hạn | FIXED | `stats/stats.service.ts:28` `take: 500` |
| DATA-M6 searchUsers ILIKE seq scan | FIXED | `users/users.service.ts:136-146` + GIN trigram index (migration 20260716120000) |
| SECURITY-M1 /feed limit không clamp | FIXED | `feed/feed.controller.ts:20` |
| SECURITY-M2 COOKIE_SECURE | FIXED | `common/cookie-secure.ts:11-16` (suy ra theo request) |
| SECURITY-M3 enumeration ở register | FIXED | `auth/auth.service.ts:157-161` |
| L1 SSE Map leak | FIXED | `notifications/notifications.service.ts:195-213` (refcount) |
| L2 double-unfollow P2025 | PARTIAL | Nay trả 404 qua filter, chưa idempotent (L3) |
| SEC-M5/DATA-L4 share không auth | FIXED | `social/reactions.controller.ts:50-52` |
| L5 click dedup race | STILL OPEN | `tracker/tracker.service.ts:36-66` (L4) |
| L6 bài của user bị ban vẫn hiển thị | STILL OPEN | M1 |

### orchestrator-synthesis-260709-2336
| # | Trạng thái | Bằng chứng |
|---|---|---|
| 1 limit không giới hạn (comments/users) | FIXED | `social/comments.controller.ts:28,39`, `users/users.controller.ts:74`, `common/parse-page-params.ts`. Còn sót: follows/bookmarks/search (L1) |
| 2 cursor sai khi sort likeCount/clickCount | FIXED | `posts/posts.service.ts:185-187` + index `schema.prisma:145-146` |
| 3 JWT_SECRET fallback public | FIXED | `docker-compose.yml:122,179` `${JWT_SECRET:?}`; `auth.module.ts:23` `getOrThrow` |
| 5 Không có ThrottlerGuard global | FIXED, nhưng sinh lỗi mới H2 | `app.module.ts:155` |
| 6 Throttler lưu in-memory | FIXED | `app.module.ts:99-106` Redis storage |
| 7 Thao tác cache không được bọc | FIXED | `posts/posts.service.ts:142-168`, `feed.service.ts:26-42` |
| 8 `?search=` dùng ILIKE | FIXED | `posts/posts.service.ts:175-176,264-289` (FTS) |
| 10 /auth/me nằm trong zone 5r/m | FIXED (nginx) | `nginx/snippets/app-locations.conf:44` location riêng |
| Retention click_logs/notifications | FIXED (có ghi chú M10) | `maintenance/retention.service.ts` |
| PK Int4 trên log tables | FIXED | `schema.prisma` ClickLog/Notification `BigInt`, migration `20260710115500_bigint_log_pks`, shim `main.ts:15-17` |
| Hard-delete user cascade | STILL OPEN | `users/users.service.ts:149-154` (M8) |
| Trending MV thiếu share_count | FIXED | migration `20260710100000_recreate_trending_mv_with_share_count` |
| OAuth thiếu `state` | FIXED | `common/oauth-state.ts`, `auth.controller.ts:172,191` |
| Verify token bị log | FIXED | `app.module.ts:62-68` serializer redact |
| Uploads: throttle + EXIF | PARTIAL | EXIF đã strip (`uploads/image-sanitizer.ts`); throttle riêng CHƯA có (M7) |
| SSRF Playwright (cần xác minh) | PARTIAL | Host được validate trước khi visit (`shopee-url-parser.ts:51-58`), nhưng redirect trong browser không bị chặn (M9) |

(Các finding thuần frontend hoặc infra như INFRA-C1/C2, H2, H5, FE-* nằm ngoài phạm vi audit backend này.)

---

## Recommended Actions (theo thứ tự ưu tiên)
1. **C1** ngay hôm nay: thêm AdminGuard + `UpdateCategoryDto` + map field tường minh; kiểm tra log và DB prod để tìm dấu hiệu bị khai thác.
2. **H1**: chặn pre-hijack khi link OAuth.
3. **H2**: bỏ các `ThrottlerGuard` ở route level.
4. **H3**: sửa metrics interceptor để alert 5xx hoạt động trở lại.
5. M1, M2, M3: lọc ban/block, dedup notification, normalize email (cần migration).
6. M4, M5: chuyển mail reset vào queue và cho phép retry.
7. M6, M7: lấy productMeta phía server, allowlist URL ảnh, throttle upload.
8. M8, M9, M10, rồi đến các mục Low.

## Metrics
- Type check: sạch (`tsc --noEmit` exit 0)
- Tests: 84/84 pass; chưa có coverage report; không có e2e. Thiếu test cho authz categories, đếm throttle, status label của metrics, link OAuth
- Lint: script `lint` thực chất chỉ chạy `tsc` (không có ESLint) nên không đếm được lỗi lint

## Unresolved Questions
1. Prod đã từng có request `PATCH/DELETE /api/categories` từ user không phải admin chưa? Cần grep log Loki và đối chiếu `users.is_admin`.
2. Có chủ đích cho login khi chưa verify email không? Điều này ảnh hưởng mức độ của H1.
3. Chính sách với user bị ban: ẩn toàn bộ nội dung, hay chỉ khoá đăng nhập? (Liên quan M1.)
4. `productMeta` có cần cho phép nhập tay khi scrape thất bại (`source:'manual'`) không?
5. Prod chạy 1 hay nhiều replica backend? Ảnh hưởng mức độ của L10, L11 (connection count, SSE).

Status: DONE_WITH_CONCERNS
Summary: Backend đã fix phần lớn finding cũ (27 FIXED, 5 PARTIAL, 3 STILL OPEN) nhưng có 1 lỗ hổng Critical mới ở categories (thiếu AdminGuard + mass-assignment Prisma nested write, dẫn tới leo thang admin và chiếm tài khoản).
Top 5: (1) C1 categories authz + mass-assignment; (2) H1 OAuth pre-account-hijack; (3) H2 throttle bị đếm đôi; (4) H3 metrics ghi lỗi thành 200, alert 5xx chết; (5) M1 nội dung của user bị ban/block vẫn hiển thị.
