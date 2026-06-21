# Brainstorm: Pivot từ Deal Aggregator → MXH Review Shopee

**Date:** 2026-06-21  
**Status:** Finalized

---

## 1. Problem Statement

Pivot toàn bộ `shopee.review` từ deal aggregator (admin-only) thành **mạng xã hội review sản phẩm Shopee** — nơi mọi user đăng bài review kèm affiliate link để kiếm thêm thu nhập.

**User decisions collected:**
- URL: `shopee.review/username` (subdirectory, không phải subdomain)
- Affiliate: User tự quản lý link của mình (Shopee không cung cấp API tracking tập trung)
- MVP features: Post review + ảnh, Follow/Newsfeed, Like/Comment, Click tracking + stats
- Auth: Email/password + Google OAuth
- Code: Viết lại từ đầu (cùng stack)
- Data: Bỏ hết data cũ, bắt đầu sạch

---

## 2. Kiến trúc tổng thể (Recommended)

### Stack (giữ nguyên)
| Layer | Tech | Lý do |
|-------|------|-------|
| Backend | NestJS 10 | Đã quen, module system phù hợp |
| Frontend | Next.js 15 (App Router) | SSR tốt cho SEO review posts |
| ORM | Prisma 6 + PostgreSQL 16 | Proven, type-safe |
| Image Storage | **Cloudflare R2** (mới) | $0 egress vs S3's $800+/month |
| Notifications | Server-Sent Events (SSE) | Simpler than WebSocket cho MVP |
| Search | PostgreSQL FTS | Không cần infra thêm cho MVP |

### Modules NestJS (mới)
```
AuthModule        → JWT + Google OAuth + email/password
UsersModule       → profile CRUD, stats aggregation
PostsModule       → CRUD + auto-scrape Shopee URL
SocialModule      → follows, likes, comments
FeedModule        → newsfeed generation (fan-out-on-write)
NotificationsModule → SSE real-time notifications
UploadsModule     → Cloudflare R2 integration
CategoriesModule  → giữ nguyên từ codebase cũ
StatsModule       → per-user analytics (clicks, views)
```

**Reuse từ codebase cũ:**
- `ScraperService` + `ShopeeApiScraper` + `ShopeePlaywrightScraper` → 100% reuse
- Categories module → reuse
- Docker/Coolify config → reuse + adjust
- `JwtStrategy` base → reuse + extend multi-user

---

## 3. Database Schema (mới)

```sql
users
  id, username (UNIQUE), email (UNIQUE), password_hash,
  google_id, display_name, bio, avatar_url,
  total_clicks, followers_count, following_count, timestamps

posts
  id, user_id (FK), title, content, product_url, affiliate_url,
  product_meta (JSONB: shopName, price, rating, soldCount, ...),
  images (TEXT[]), category_id (FK),
  like_count, comment_count, click_count, timestamps

follows
  follower_id (FK), following_id (FK)
  PRIMARY KEY (follower_id, following_id)

likes
  user_id (FK), post_id (FK)
  PRIMARY KEY (user_id, post_id)

comments
  id, user_id (FK), post_id (FK), parent_id (nullable FK),
  content, timestamps

click_logs
  id, post_id (FK), ip, user_agent, referer, created_at

notifications
  id, recipient_id (FK), type (ENUM: LIKE|COMMENT|FOLLOW|MENTION),
  actor_id (FK), post_id (nullable FK), read (BOOL), timestamps

categories
  (giữ nguyên từ schema cũ)
```

---

## 4. Next.js Routes

```
/                    → Public feed (tất cả posts, trending)
/[username]          → Profile page (posts, followers, stats)
/[username]/[postId] → Post detail + comments
/create              → Tạo post mới (protected)
/feed                → Newsfeed cá nhân - posts từ followed (protected)
/dashboard           → Stats: clicks, earnings estimate (protected)
/settings            → Profile settings (protected)
/search?q=...        → Tìm kiếm posts + users
/category/[slug]     → Filter theo category
/auth/login          → Login
/auth/register       → Register
/auth/callback       → Google OAuth callback
```

**⚠️ Route conflict warning:**  
`/[username]` là dynamic route sẽ "ăn" tất cả paths. Cần đặt static routes (`/create`, `/feed`, `/search`, `/dashboard`, `/settings`, `/auth`, `/category`) TRƯỚC dynamic route trong Next.js App Router — dùng parallel routes hoặc route groups để tránh conflict.

---

## 5. Affiliate Model

Shopee không có API programmatic cho click tracking. Approach:

```
User đăng ký Shopee Affiliate → lấy affiliate ID của mình
  ↓
Khi tạo post: paste Shopee URL → platform auto-scrape + auto-generate affiliate link
  (dùng affiliate ID của user)
  ↓
Post published với redirect URL: shopee.review/r/[postId]
  ↓
Visitor click → platform log click vào click_logs → redirect đến affiliateUrl
  ↓
User xem stats: total clicks, click-through rate
```

**Note:** Platform không can thiệp vào hoa hồng thực tế — đó là giữa Shopee và user trực tiếp. Platform chỉ cung cấp analytics về clicks.

---

## 6. Newsfeed Strategy

**Fan-out-on-write** cho MVP:
- Khi user A đăng post → push vào feed của tất cả followers của A
- Simple, fast read, phù hợp với scale nhỏ-vừa
- Khi user có >10K followers: switch sang hybrid (skip cho MVP)

Implementation đơn giản nhất: query posts từ followed users, sort by createdAt — không cần Redis feed cache ban đầu.

---

## 7. Rủi ro và Mitigation

| Rủi ro | Mức độ | Mitigation |
|--------|--------|-----------|
| **Legal: "shopee" trong domain** | Cao | Cân nhắc rebranding (shopie.review, shopreview.vn...) — Sea Limited có precedent kiện subdomain clones |
| Route conflict `/[username]` | Trung | Đặt static routes trước, test kỹ với Next.js route groups |
| Spam review | Trung | Rate limiting, email verification bắt buộc, report system |
| Fake affiliate clicks | Thấp | Lưu IP + user_agent, dedup clicks từ same IP trong 24h |
| Cloudflare R2 setup | Thấp | Cần setup Cloudflare account + bucket trước khi deploy |
| Playwright memory trong prod | Thấp | Giữ nguyên từ codebase cũ, đã handled |

---

## 8. Phased Implementation

### Phase 1 — Core Social Platform
- Auth (email + Google OAuth)
- User profiles (`/[username]`)
- Create/edit/delete posts + Shopee URL scraper
- Image upload → Cloudflare R2
- Public feed + category filter

### Phase 2 — Social Features
- Follow/unfollow
- Personal newsfeed (`/feed`)
- Like/comment
- SSE notifications (like, comment, follow)

### Phase 3 — Analytics & Growth
- Click tracking dashboard (`/dashboard`)
- Search (PostgreSQL FTS)
- Trending posts algorithm
- Share to social (OG meta tags)

---

## 9. Quyết định cuối

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stack | NestJS + Next.js + Prisma + PG | Không thay đổi, đã proven |
| Image storage | Cloudflare R2 | $0 egress, critical cho UGC |
| URL profile | `/[username]` | Simple, SEO-friendly |
| Auth | Email + Google OAuth | Best UX |
| Affiliate | User self-managed | Shopee API limitation |
| Notifications | SSE | Simpler than WS cho MVP |
| Search | PostgreSQL FTS | No extra infra |
| Newsfeed | Fan-out-on-write | Simple for MVP scale |
| Data migration | Start fresh | Clean slate |
| Scraper | 100% reuse | Most valuable asset |

---

## Unresolved Questions
1. **Legal**: Có nên đổi tên/domain để tránh rủi ro trademark với Shopee không?
2. **Verification**: Có cần verify tài khoản Shopee Affiliate của user không (để đảm bảo link hợp lệ)?
3. **Moderation**: Có cần review queue cho posts trước khi publish không (chống spam)?
