---
title: "Pivot: MXH Review Shopee"
status: completed
created: 2026-06-21
completed: 2026-06-21
brainstorm: plans/reports/brainstorm-260621-2051-pivot-social-review-platform.md
---

# Pivot: shopee.review → MXH Review Sản Phẩm Shopee

## Mục tiêu
Chuyển đổi từ admin-only deal aggregator thành mạng xã hội review sản phẩm Shopee, nơi bất kỳ ai cũng có thể đăng bài review kèm affiliate link để kiếm thu nhập.

## Stack
- **Backend:** NestJS 10 + Prisma 6 + PostgreSQL 16
- **Frontend:** Next.js 15 (App Router) + Tailwind CSS
- **Storage:** Cloudflare R2 (thay thế local uploads)
- **Auth:** JWT + Google OAuth (Passport.js)
- **Notifications:** Server-Sent Events (SSE)
- **Search:** PostgreSQL Full-Text Search

## Reuse từ codebase cũ
| Component | Action |
|-----------|--------|
| ScraperService (API + Playwright) | ✅ Reuse 100% |
| Categories module | ✅ Reuse, minor update |
| Docker / Coolify config | ✅ Reuse + adjust |
| JwtStrategy base | ✅ Reuse + extend |
| Deals/Admin/Scheduler modules | ❌ Xóa |
| Local upload service | ❌ Thay bằng R2 |
| Database schema | ❌ Xóa, viết lại |

## Phases

| Phase | Tên | Ưu tiên | Trạng thái |
|-------|-----|---------|-----------|
| [01](phase-01-setup-cleanup-database.md) | Setup, Cleanup & Database Schema | Critical | ✅ Done |
| [02](phase-02-auth-system.md) | Auth System (Email + Google OAuth) | Critical | ✅ Done |
| [03](phase-03-users-profiles.md) | Users & Profile Module | High | ✅ Done |
| [04](phase-04-posts-scraper.md) | Posts Module + Scraper Integration | High | ✅ Done |
| [05](phase-05-cloudflare-r2-uploads.md) | Image Upload (Cloudflare R2) | High | ✅ Done |
| [06](phase-06-social-features.md) | Social Features (Follows/Likes/Comments) | High | ✅ Done |
| [07](phase-07-feed-notifications.md) | Feed & SSE Notifications | Medium | ✅ Done |
| [08](phase-08-click-tracking-analytics.md) | Click Tracking & Analytics | Medium | ✅ Done |
| [09](phase-09-frontend-redesign.md) | Frontend Complete Redesign | High | ✅ Done |
| [10](phase-10-search-seo-polish.md) | Search, SEO & Polish | Low | ✅ Done |

## Implementation Notes (2026-06-21)
- **Build status:** Backend (`nest build`) ✅, Frontend (`next build`, 15 routes) ✅, monorepo typecheck ✅.
- **DB:** Reset + `initial_social_schema` + `add_posts_fts_index` migrations applied; 10 categories seeded.
- **Runtime smoke tests passed:** register→email-verify→create-post, login cookie/`/me`, like + like-status, `/r/:id` 302 affiliate redirect, trending, FTS search, email-gate 403, reserved-username 400.
- **Deviations from plan:** `bcrypt` → `bcryptjs` (no native build in env); dashboard chart uses CSS bars instead of `recharts` (no extra dep); Google OAuth + Resend + R2 boot with placeholders and activate once env vars are set. Workspace is not a git repo, so no branch/commit was created.

## Key Dependencies
```
Phase 01 → 02 → 03 → 04
                  ↓
              05 → 06 → 07
                        ↓
              08 → 09 → 10
```

## Rủi ro chính
1. ⚠️ **Legal**: "shopee" trong domain có thể vi phạm trademark Sea Limited
2. 🔀 **Route conflict**: `/[username]` dynamic route cần xử lý cẩn thận
3. 🛡️ **Spam**: Cần email verification + rate limiting từ đầu

## Validation Log

### Session 1 — 2026-06-21
**Trigger:** Initial plan creation — validate assumptions trước khi implement
**Questions asked:** 7

#### Questions & Answers

1. **[Security]** Phase 02 plan nói dùng localStorage để lưu JWT token. Đây là security risk (dễ bị XSS). Bạn muốn dùng cách nào?
   - Options: HttpOnly Cookie | localStorage
   - **Answer:** HttpOnly Cookie
   - **Rationale:** Bảo mật tốt hơn, chống XSS. Backend set cookie, browser tự gửi. Ảnh hưởng Phase 02 (auth flow) và Phase 07 (SSE auth).

2. **[Architecture]** Khi user chưa có Shopee Affiliate ID, link trong post sẽ là gì?
   - Options: Link Shopee gốc | Bắt buộc nhập affiliate link
   - **Answer:** Bắt buộc nhập affiliate link
   - **Rationale:** User phải tự paste link affiliate vào form. Không auto-generate. Ảnh hưởng Phase 04 (affiliateUrl là required field).

3. **[Architecture]** SSE Notifications cần JWT nhưng EventSource không hỗ trợ custom headers. Plan đề xuất pass token qua query param. Bạn chọn cách nào?
   - Options: Token qua query param | Polling thay SSE
   - **Answer:** Token qua query param — tuy nhiên vì đã chọn HttpOnly Cookie, approach đúng là dùng `withCredentials: true` (browser tự gửi cookie, không cần query param)
   - **Rationale:** Kết hợp HttpOnly Cookie + SSE với `withCredentials: true` là approach an toàn và đúng nhất. Ảnh hưởng Phase 07.

4. **[Scope]** Phase 09 (Frontend) được đặt cuối cùng. Approach phát triển?
   - Options: Backend trước → Frontend sau | Song song
   - **Answer:** Backend trước, Frontend sau
   - **Rationale:** Build toàn bộ API (Phase 01-08) → test với Postman → Phase 09 wire frontend vào APIs đã sẵn sàng.

5. **[Architecture]** Conflict: HttpOnly Cookie không cho JS đọc token, SSE `withCredentials: true` là approach đúng?
   - Options: Cookie tự động (withCredentials) | Query param (bỏ cookie auth)
   - **Answer:** Cookie tự động — kết luận từ việc chọn HttpOnly Cookie
   - **Rationale:** `new EventSource(url, { withCredentials: true })` tự gửi cookie. Backend đọc từ `req.cookies` thay vì `req.query.token`.

6. **[Scope]** Email verification: user cần xác minh email trước khi đăng bài không?
   - Options: Bắt buộc xác minh | Không cần
   - **Answer:** Google OAuth → email đã verified. Email/password signup → cần xác minh email trước khi đăng bài.
   - **Rationale:** Hybrid: Google users skip verification, email users cần confirm link. Cần thêm `emailVerified` field trong users table. Ảnh hưởng Phase 01 (schema) và Phase 02 (auth flow).

7. **[Scope]** Post sau khi tạo: publish ngay hay admin duyệt?
   - Options: Publish ngay | Admin duyệt trước
   - **Answer:** Publish ngay
   - **Rationale:** Đơn giản cho MVP, dùng rate limiting thay moderation queue.

#### Confirmed Decisions
- **Token Storage:** HttpOnly Cookie — an toàn hơn localStorage
- **SSE Auth:** `withCredentials: true` — cookie tự gửi, không cần query param
- **Affiliate Link:** Required field — user phải tự nhập link affiliate
- **Dev Flow:** Backend trước (Phase 01-08), Frontend sau (Phase 09)
- **Email Verification:** Chỉ cho email/password signup, Google OAuth miễn
- **Post Moderation:** Publish ngay, rate limiting 10 posts/giờ

#### Action Items
- [ ] Phase 01: Thêm `email_verified BOOLEAN DEFAULT false` vào users schema
- [ ] Phase 02: Đổi từ localStorage sang HttpOnly Cookie; thêm email verification flow cho email/password signup; Google OAuth tự set `emailVerified: true`
- [ ] Phase 04: `affiliateUrl` là required field trong `CreatePostDto`; loại bỏ auto-generate affiliate link
- [ ] Phase 07: SSE dùng `withCredentials: true`; backend đọc từ `req.cookies['auth_token']` thay vì query param

#### Impact on Phases
- Phase 01: Thêm `email_verified` column vào users table
- Phase 02: HttpOnly Cookie auth flow + email verification cho email/password
- Phase 04: affiliateUrl required, bỏ auto-generate logic
- Phase 07: SSE withCredentials + cookie-based guard

### Session 2 — 2026-06-21
**Trigger:** Re-validation theo yêu cầu user — đào sâu các gap còn lại (URL strategy, DM scope, scraper risk, pagination)
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** URL trang cá nhân: path-based `shopee.review/username` hay subdomain `username.shopee.review`?
   - Options: Path-based + blocklist | Subdomain
   - **Answer:** Path-based `shopee.review/username` + reserved username blocklist
   - **Rationale:** Đúng use case "đem URL đi quảng bá" — Instagram/TikTok/Linktree đều dùng path-based. Không cần wildcard SSL/DNS, SEO dồn về 1 domain, trust cao. Hệ quả: cần blocklist username (chặn create, feed, admin, api, r...).

2. **[Scope]** Tính năng nhắn tin trực tiếp (DM) giữa users?
   - Options: Bỏ khỏi MVP | Roadmap sau | Làm ngay
   - **Answer:** Bỏ DM khỏi MVP
   - **Rationale:** DM cần WebSocket + chat schema + UI phức tạp. Xóa nút [Message] khỏi profile mockup. Tập trung core review + social trước.

3. **[Risk]** Chiến lược chống Shopee ban IP khi scrape?
   - Options: Cache+queue ngay, proxy pool phase riêng | Proxy pool trong MVP | Chỉ cache
   - **Answer:** Cache trước (24h theo productUrl) + abstraction layer cho ScraperProvider; test tải rồi mới quyết proxy/browser pool sau
   - **Custom input:** "Cache trước thôi, sau đó chúng ta test tải sau"
   - **Rationale:** Cache giảm tần suất scrape mạnh nhất với chi phí thấp nhất (nhiều user review cùng sp → scrape 1 lần). Abstraction layer để sau cắm proxy pool (ý user: nhiều Playwright/cloak-browser + nhiều proxy) mà không phải viết lại. Proxy pool là lớp 2, defer tới khi volume biện minh chi phí proxy residential.

4. **[Architecture]** Pagination cho feed/posts: cursor-based hay offset?
   - Options: Cursor-based cho feed | Offset
   - **Answer:** Cursor-based cho feed/posts
   - **Rationale:** Tất cả MXH lớn (FB, X, Threads, IG, Reddit) dùng cursor-based — tránh duplicate/miss khi có post mới, performance ổn định khi scale. Giữ offset cho dashboard/stats (Phase 08) nơi cần số trang.

#### Confirmed Decisions
- **URL Profile:** Path-based `shopee.review/username` + reserved username blocklist
- **DM Feature:** Bỏ khỏi MVP (xóa nút Message)
- **Scraper Strategy:** Cache 24h + ScraperProvider abstraction; proxy/browser pool defer (test tải sau)
- **Pagination:** Cursor-based cho feed/posts; offset cho admin/stats

#### Action Items
- [ ] Phase 01: Thêm bảng `scraped_products` (cache scrape); document reserved username constant
- [ ] Phase 02: Thêm reserved username blocklist vào RegisterDto validation
- [ ] Phase 03: Xóa nút [Message] khỏi profile mockup; cursor pagination cho getUserPosts
- [ ] Phase 04: Cache layer (check `scraped_products` trước khi scrape, lưu sau scrape); ScraperProvider abstraction interface; cursor pagination cho posts list; scrape rate limit per-user
- [ ] Phase 06: Cursor pagination cho comments list
- [ ] Phase 07: Cursor pagination cho feed

#### Impact on Phases
- Phase 01: Thêm `scraped_products` cache table + reserved username note
- Phase 02: Reserved username blocklist validation
- Phase 03: Bỏ [Message] button, cursor pagination
- Phase 04: Scrape cache + abstraction + cursor pagination + scrape rate limit
- Phase 06: Cursor pagination cho comments
- Phase 07: Cursor pagination cho feed
