# Brainstorm: shopee.review — Deal Aggregator MVP

## Problem Statement
Xây dựng website shopee.review để kiếm tiền từ Shopee Affiliate. Admin paste Shopee product URL → hệ thống tự động scrape thông tin sản phẩm → gen affiliate link → publish deal lên web. User truy cập shopee.review để tìm deal/kèo ngon.

## Quyết định đã thống nhất

| Hạng mục | Quyết định |
|----------|-----------|
| MVP Approach | Manual-first — Admin paste URL, auto-fill, review/edit, publish |
| Tech Stack | NestJS (backend) + Next.js (frontend) |
| UI Style | Dual mode: Deal Card Grid + Social Feed, toggle chuyển đổi. Có danh mục, filter, sort |
| Data Source (MVP) | Thủ công — Admin copy URL từ FB/Zalo/Telegram groups rồi paste vào admin panel |
| Affiliate Link | Auto-gen bằng URL format (không cần API) |
| Deploy | Home server + Cloudflare (user đã có infra) |

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────┐
│                   CLOUDFLARE                         │
│              (DNS + CDN + Proxy)                     │
└──────────────┬──────────────────┬────────────────────┘
               │                  │
    ┌──────────▼──────┐  ┌───────▼────────┐
    │   Next.js App   │  │  NestJS API    │
    │  (Frontend SSR) │  │  (Backend)     │
    │                 │  │                │
    │ • Deal listing  │  │ • URL scraper  │
    │ • Grid/Feed UI  │  │ • Affiliate    │
    │ • Category/     │  │   link gen     │
    │   Filter/Sort   │  │ • Deal CRUD    │
    │ • SEO optimized │  │ • Admin auth   │
    │ • Deal detail   │  │ • Scheduler    │
    └─────────────────┘  │   (expiry)     │
                         └───────┬────────┘
                                 │
                         ┌───────▼────────┐
                         │  PostgreSQL    │
                         │  • deals       │
                         │  • categories  │
                         │  • tags        │
                         │  • click_logs  │
                         └────────────────┘
```

## Core Features

### 1. Admin Panel — Deal Input
- **Paste URL**: Dán Shopee product URL
- **Auto-fill**: Scrape tự động → tên, giá gốc, giá sale, % giảm, hình ảnh, shop name, rating, đã bán
- **Editable fields**: Admin chỉnh sửa mọi field trước khi publish
- **Extra fields**:
  - Ghi chú / lý do nên mua
  - Voucher code (nếu có)
  - Thời hạn deal (expiry) → auto-hide khi hết hạn
  - Danh mục sản phẩm
  - Tags/labels: hot, flash sale, giá sốc, freeship, v.v.
- **Affiliate link**: Tự động gen từ product URL + affiliate ID

### 2. Public Website — Deal Display
- **Dual view mode**: Card Grid (default) ↔ Social Feed, toggle chuyển
- **Deal card hiển thị**:
  - Hình sản phẩm
  - Tên sản phẩm (truncated)
  - Giá gốc (gạch ngang) + giá sale (nổi bật, đỏ)
  - % giảm giá (badge)
  - Countdown timer (nếu có expiry)
  - Tags (hot, flash sale, freeship...)
  - Shop name + rating
  - Nút "Mua ngay" → redirect qua affiliate link
- **Filter/Sort**:
  - Theo danh mục
  - Theo tag
  - Theo % giảm
  - Theo giá
  - Mới nhất / hot nhất
- **SEO**: SSR với Next.js, meta tags, structured data cho Google

### 3. Shopee URL Scraper
- Scrape Shopee product page (Puppeteer/Playwright hoặc mobile API)
- Extract: name, price, original_price, discount_percent, images, shop_name, shop_rating, sold_count, description
- Handle edge cases: link hết hạn, sản phẩm bị xóa, variants

### 4. Affiliate Link Generator
- Format: `https://s.shopee.vn/an_redir?origin_link={encoded_url}&affiliate_id={ID}&sub_id={tracking}`
- Sub ID dùng để track click theo deal/campaign
- Click tracking: log mỗi click để phân tích hiệu quả

### 5. Deal Lifecycle
- **Active**: Đang hiển thị
- **Expired**: Hết hạn → auto-hide hoặc đánh dấu "Đã hết"
- **Draft**: Chưa publish
- **Archived**: Admin ẩn thủ công

## Database Schema (Draft)

```
deals:
  id, title, description, note
  original_url, affiliate_url
  original_price, sale_price, discount_percent
  images[] (jsonb)
  shop_name, shop_rating, sold_count
  category_id, tags[] (jsonb)
  voucher_code
  expires_at
  status (draft/active/expired/archived)
  click_count
  created_at, updated_at

categories:
  id, name, slug, icon, sort_order

click_logs:
  id, deal_id, ip, user_agent, referer, created_at
```

## Approach: Scrape Shopee Product Info

### Option A: Puppeteer/Playwright (Server-side browser)
- **Pros**: Render JS, lấy được mọi data, ổn định
- **Cons**: Tốn RAM, chậm hơn, cần manage browser instance
- **Khi nào**: Shopee block API requests

### Option B: Shopee Mobile API (reverse-engineer)
- **Pros**: Nhanh, nhẹ, structured JSON response
- **Cons**: API endpoint có thể thay đổi, cần maintain
- **Endpoint**: `https://shopee.vn/api/v4/item/get?itemid={id}&shopid={shop_id}`
- **Khi nào**: Nếu API vẫn public (cần test)

### Recommended: Option B trước, fallback sang Option A

## Rủi ro & Giải pháp

| Rủi ro | Mức độ | Giải pháp |
|--------|--------|-----------|
| Shopee block scraper | Trung bình | Rate limit, rotate user-agent, fallback Puppeteer |
| Shopee thay đổi API/format | Trung bình | Abstract scraper layer, dễ update |
| Affiliate link format thay đổi | Thấp | Config-based, dễ cập nhật |
| Deal hết hạn nhưng vẫn hiển thị | Thấp | Cron job check expiry mỗi 5 phút |
| SEO chậm index | Trung bình | Sitemap, structured data, Cloudflare cache |

## Success Metrics
- Thời gian từ paste URL → publish: < 10 giây
- Trang load time: < 2 giây (LCP)
- Click-through rate trên affiliate link
- Revenue từ Shopee affiliate commission
- Organic traffic từ Google

## Phân chia Phase

### Phase 1 — MVP Core (tuần 1-2)
- [ ] Setup NestJS + Next.js + PostgreSQL
- [ ] Shopee URL scraper (API + Puppeteer fallback)
- [ ] Affiliate link generator
- [ ] Admin panel: paste URL → auto-fill → edit → publish
- [ ] Public page: deal card grid + basic filter
- [ ] Deploy home server + Cloudflare

### Phase 2 — UX Enhancement (tuần 3)
- [ ] Dual view mode (grid ↔ feed) with toggle
- [ ] Category system + tag system
- [ ] Advanced filter/sort
- [ ] Countdown timer cho deal có expiry
- [ ] Click tracking + analytics dashboard
- [ ] SEO optimization (sitemap, structured data, meta tags)

### Phase 3 — Automation (tương lai)
- [ ] Telegram bot auto-fetch deals
- [ ] Zalo integration (zlapi)
- [ ] Facebook browser automation
- [ ] AI deal parsing (LLM extract info từ bài post)
- [ ] Auto-categorize deals
- [ ] Push notification cho user (deals hot)

## Tech Stack Chi tiết

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 15 (App Router, SSR) |
| UI Library | Tailwind CSS + shadcn/ui |
| Backend | NestJS + TypeORM/Prisma |
| Database | PostgreSQL |
| Scraper | Shopee API v4 + Playwright fallback |
| Cache | Redis (optional, cho hot deals) |
| Deploy | Docker Compose on home server |
| CDN/Proxy | Cloudflare |
| Auth (admin) | JWT / session-based (single admin) |

## Sources
- [Shopee Affiliate Program](https://affiliate.shopee.vn/)
- [Shopee Affiliate Link Generator (GitHub)](https://github.com/crushedmonster/shopee-affiliate-link-generator)
- [Shopee Link Generator Tool](https://shopee-link-generator.pages.dev/)
- [Shopee & Meta partnership](https://vietnamnet.vn/en/shopee-and-meta-launch-affiliate-tools-for-vietnamese-creators-2455262.html)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [zlapi - Unofficial Zalo API](https://github.com/Its-VrxxDev/zlapi)
