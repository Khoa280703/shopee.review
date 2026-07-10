# Phase 2 Security Batch — Code Review

Scope: commits `e984d08`, `c68073d`, `d7b2277`, `e51fc94`, `76e3afd` + working tree.
Verdict: không có bug CRITICAL nào làm gãy login hoặc mở SSRF. Có vài MEDIUM (DoS/log-leak) nên xử lý trước prod.

## CRITICAL
Không có (confirmed).

## HIGH
Không có confirmed. (OAuth login KHÔNG bị gãy — xem mục xác minh bên dưới.)

## MEDIUM

1. **OAuth `code` không được redact khỏi log** — `app.module.ts:55`
   Regex chỉ bắt `token|reset_token|verify_token`. Callback Google
   `/api/auth/google/callback?code=<authcode>&state=...` log nguyên `code` vào Loki.
   `code` là OAuth authorization code (single-use, short-lived) — vẫn là credential.
   CONFIRMED. Fix: thêm `code|access_token` vào alternation:
   `/([?&](?:token|reset_token|verify_token|code|access_token)=)[^&]*/gi`.

2. **SSRF fetch không có timeout** — `shopee-url-parser.ts:37`
   `fetch(current, { method:'HEAD', redirect:'manual' })` không có `signal`.
   Host allowlist chặn được đích internal, nhưng một Shopee host phản hồi chậm / treo
   khiến request scraper hang, tối đa 5 hop → resource exhaustion. CONFIRMED (thiếu guard).
   Fix: `signal: AbortSignal.timeout(5000)` mỗi hop.

3. **Decompression-bomb qua sharp** — `image-sanitizer.ts:14`
   File-size cap 5MB chặn input nén, nhưng PNG/WEBP 5MB có thể decode ra vài trăm MB
   pixel. Không hạ `limitInputPixels` (mặc định ~268MP vẫn rất lớn) → spike RAM per upload.
   THEORETICAL (default guard tồn tại nhưng ngưỡng cao). Fix: `sharp(buffer,{ limitInputPixels: 24_000_000 })`.

4. **GIF passthrough bỏ qua cap kích thước** — `image-sanitizer.ts:12`
   GIF trả buffer gốc, không qua resize `MAX_DIMENSION` và không re-encode.
   Không phải XSS (đã sniff magic bytes = GIF thật), nhưng GIF động/lớn được lưu/serve nguyên trạng.
   CONFIRMED (đúng như comment, chấp nhận được nhưng nên note). Cân nhắc cap frame/kích thước hoặc từ chối GIF > N.

## LOW

5. **pino req serializer có thể mất client IP** — `app.module.ts:58-62`
   Serializer đọc `req.remoteAddress`/`req.remotePort` trực tiếp; trên Node IncomingMessage
   IP nằm ở `req.socket.remoteAddress` → nhiều khả năng log ra `undefined`. Regression nhẹ về observability,
   không phải security. Verify bằng 1 request thật; nếu undefined, đọc qua `req.raw?.socket`.

6. **Animated WebP bị dẹp còn 1 frame** — `image-sanitizer.ts:23`
   `sharp(buffer)` không set `{ animated:true }` → webp động re-encode mất animation.
   Functional, không security.

7. **`COOKIE_SECURE` phải = 'true' ở prod** — `google-auth.guard.ts:22`
   Nonce cookie chỉ `Secure` khi env đúng. SameSite=Lax không-Secure vẫn hoạt động nhưng nên bật Secure prod.

## Xác minh trọng điểm (theo yêu cầu)

- **OAuth login không gãy (CONFIRMED).** `google.strategy.ts` KHÔNG set `state:true`, nên passport-oauth2
  1.8.0 dùng `NullStore` → `verify()` luôn pass, không throw dù ta truyền custom `state`. State thực sự
  được double-submit kiểm ở controller. `getAuthenticateOptions` trả `{}` khi có `req.query.state`
  (callback leg) → không mint cookie mới. Đúng.
- **State check TRƯỚC `googleLogin` (CONFIRMED).** `auth.controller.ts:149-154`: mismatch/thiếu cookie →
  redirect `?error=oauth_state` và return trước `googleLogin`. Cookie thiếu KHÔNG được dung thứ (`!cookieState` bắt).
- **Cookie sống sót redirect về (CONFIRMED).** SameSite=Lax gửi trên top-level GET navigation từ Google → OK.
- **SSRF allowlist trước mỗi fetch (CONFIRMED).** `:34` check trước `:37`. Bypass đã thử:
  `//169.254.169.254` → hostname `169.254.169.254` reject; userinfo `shopee.vn@evil` → hostname = evil reject;
  case xử lý bằng `.toLowerCase()`; suffix `shopee.vn.evil.com` reject (Set khớp chính xác). Đều an toàn.
- **`redirect:'manual'` (CONFIRMED).** undici/Node fetch trả response 3xx với header `location` đọc được
  (khác browser opaqueredirect) → không auto-follow, code hoạt động đúng.
- **EXIF drop (CONFIRMED).** sharp không giữ metadata trừ khi gọi `withMetadata()`; `.rotate()` bake orientation. Đúng.
- **MIME/ext nhất quán (CONFIRMED).** controller set `file.mimetype = sniffed`; `r2-upload.service.ts:44,50`
  dùng cùng mimetype cho ext + ContentType. Đồng bộ.
- **Cursor keyset đúng (CONFIRMED).** `posts.service.ts:183-189`: compound orderBy `[sortBy, id]` +
  `cursor:{id}` — Prisma tra row theo id rồi suy keyset từ giá trị các cột orderBy của row đó. Đúng như comment.
  Composite index `(like_count DESC,id DESC)` & `(click_count DESC,id DESC)` đã thêm (migration + schema) → không full-sort.
  `sortBy` được `@IsIn([...])` chặn injection cột (`query-posts.dto.ts:27`).
- **sharp trong Docker (CONFIRMED OK).** `apps/backend/Dockerfile`: `pnpm install --frozen-lockfile` chạy TRONG
  container `node:20-slim` (glibc). Lockfile có `@img/sharp-linux-x64@0.35.3` → binary linux đúng được fetch
  ngay trong container, không phải copy từ macOS. `@img/*` là prebuilt (không cần build-script approval của pnpm10). OK.
- **notifications/cache best-effort (OK).** `create()` catch+warn không nuốt im lặng; `fanoutNewPost` catch+error log;
  `cached()` degrade về DB read khi Redis lỗi, có warn. Không có failure bị giấu.

## Đề xuất hành động (ưu tiên)
1. Thêm `code|access_token` vào regex redact (MEDIUM #1) — leak credential vào log.
2. Thêm `AbortSignal.timeout` cho fetch SSRF (MEDIUM #2).
3. Hạ `limitInputPixels` / cân nhắc cap GIF (MEDIUM #3,#4).
4. Verify client IP có log không (LOW #5); đảm bảo `COOKIE_SECURE=true` ở prod (LOW #7).

## Unresolved questions
- Shopee short link (`shope.ee`/`s.shopee.vn`) có trả redirect trên request **HEAD** không? Nếu server trả 405
  hoặc không kèm `Location` cho HEAD, short-link resolution sẽ fail (functional). Cần test thực tế; cân nhắc fallback GET.
- Global ValidationPipe có bật `whitelist`/`forbidNonWhitelisted` không? (không thuộc diff này nhưng ảnh hưởng an toàn `sortBy`).

Status: DONE_WITH_CONCERNS
Summary: 0 Critical, 0 High confirmed, 4 Medium, 3 Low. Login OAuth và SSRF guard đã xác minh an toàn; vá redact `code`, timeout fetch, và pixel-limit trước prod.
