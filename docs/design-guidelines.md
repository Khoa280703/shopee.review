# Design Guidelines — shopee.review

## Brand Identity

**App name:** `shopee.review`  
**Tagline:** Review thật, mua sắm thông minh  K
**Language:** Vietnamese (UI labels, placeholders, navigation all in Vietnamese)  
**Personality:** Community-driven, trustworthy, energetic but not aggressive

---

## Color Palette

### Primary — Orange Red (Shopee brand, use sparingly — CTAs only)
| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#EE4D2D` | Buy Now button, Post button, Logo accent |
| `primary-hover` | `#D44226` | Hover state of primary buttons |
| `primary-light` | `#FFF0ED` | Hover bg on ghost buttons |

### Neutrals (dominant — 90% of the UI)
| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#FAFAF9` | App background |
| `surface` | `#FFFFFF` | Cards, sidebar, header |
| `surface-dim` | `#F4F4F3` | Input backgrounds, tags |
| `border` | `#E8E8E6` | Card borders, dividers |
| `text-primary` | `#111110` | Headings, usernames, prices |
| `text-secondary` | `#6F6E6B` | Timestamps, subtext, placeholders |
| `text-muted` | `#A3A29F` | Disabled states, hints |

### Semantic
| Token | Hex | Usage |
|-------|-----|-------|
| `like-active` | `#E0245E` | Liked heart icon |
| `verified` | `#1D9BF0` | Verified badge |
| `rating` | `#F5A623` | Star rating |
| `price-sale` | `#EE4D2D` | Sale price (same as primary) |

---

## Typography

**Font:** Inter (Google Fonts)  
All weights: 400 (body), 500 (medium), 600 (semibold), 700 (bold)

| Scale | Size / Weight | Usage |
|-------|--------------|-------|
| `display` | 28px / 700 | Page titles |
| `headline` | 18px / 600 | Section headers, card titles |
| `body-lg` | 16px / 400 | Post content, review text |
| `body-sm` | 14px / 400 | Comments, captions |
| `label` | 13px / 600 | Buttons, tags, nav labels |
| `caption` | 12px / 400 | Timestamps, metadata |
| `price` | 18px / 700 | Product prices (letter-spacing: -0.02em) |

---

## Spacing

Base unit: 4px  
`xs=4 sm=8 md=16 lg=24 xl=40 2xl=64`

---

## Layout

### Desktop (≥ 1024px) — 3-column
```
┌──────────┬─────────────────────┬──────────────┐
│ Left Nav │    Center Feed      │ Right Panel  │
│  240px   │   max-w-600px       │    280px     │
│  fixed   │   scrollable        │   sticky     │
└──────────┴─────────────────────┴──────────────┘
```
- Left nav: Logo + nav links + "Đăng bài" CTA button
- Center: single-column post feed
- Right: Trending sản phẩm + Gợi ý theo dõi

### Mobile (< 1024px) — single column
```
┌────────────────────────┐
│   Top header (fixed)   │  Logo + Search + Notif + Avatar
├────────────────────────┤
│   Single column feed   │
├────────────────────────┤
│   Bottom nav (fixed)   │  Home / Khám phá / Đăng / Bảng tin / Cá nhân
└────────────────────────┘
```

---

## Components

### Navigation — Left sidebar (Desktop)
- Logo "shopee.review" (orange text, semibold)
- Nav items: Trang chủ / Khám phá / Bảng tin / Trang cá nhân / Thống kê / Cài đặt
- Active state: bold black text + light gray bg
- "Đăng bài" button: full-width, rounded-full, primary orange
- Bottom: avatar + tên + username + logout icon

### Navigation — Bottom bar (Mobile)
- 5 icons: Trang chủ / Khám phá / Đăng (center, primary) / Bảng tin / Cá nhân
- Active: bold black icon

### Post Card — 2 variants

#### Variant A: Bài thảo luận (Discussion)
```
┌─────────────────────────────────┐
│ [Avatar] Tên người dùng  · 2h   │
│           @username             │
│                                 │
│ Nội dung bài viết...            │
│                                 │
│ [Ảnh grid nếu có]               │
│                                 │
│ [Tag chip] [Tag chip]           │
│                                 │
│ 💬 24   🔁 5   ♥ 142   ↗       │
└─────────────────────────────────┘
```
- No Buy Now button
- Action bar: Comment / Repost / Like / Share (ghost icons, minimal)

#### Variant B: Bài review sản phẩm (Product Review)
```
┌─────────────────────────────────┐
│ [Avatar] Tên người dùng  · 2h   │
│           @username             │
│                                 │
│ ⭐⭐⭐⭐½  4.5/5               │
│                                 │
│ Nội dung review sản phẩm...     │
│                                 │
│ [Ảnh carousel/grid]             │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ [Ảnh] Tên sản phẩm          │ │  ← Product Preview Card
│ │       ₫35.000 ~~₫50.000~~  │ │     subtle border, bg-dim
│ │                  [Mua ngay] │ │  ← CTA: primary orange
│ └─────────────────────────────┘ │
│                                 │
│ 💬 89   🔁 42  ♥ 1.2K  ↗      │
└─────────────────────────────────┘
```
- **Product Preview Card** is a nested card with 1px border, light background
- **"Mua ngay"** button: primary orange, rounded-lg, small size
- Star rating shown above content

### Header (Mobile)
- Left: "shopee.review" logo (orange)
- Right: search icon + notification bell + avatar

### Create Post Box (top of feed)
- Textarea: "Bạn đang review sản phẩm gì hôm nay?"
- Action row: image upload / product link / emoji / post button (disabled until content)

### Profile Header
- Cover image area (optional, muted gradient bg if none)
- Avatar: circular, 88px desktop / 72px mobile
- Tên hiển thị (bold) + @username + bio
- Stats row: X bài · X người theo dõi · X đang theo dõi
- Action: "Theo dõi" (black filled) or "Chỉnh sửa" if self

### Right Sidebar panels
1. **Sản phẩm thịnh hành**: top 5 products with thumbnail + name + review count
2. **Gợi ý theo dõi**: 3 suggested users with avatar + name + follow button

### Buttons
| Variant | Style |
|---------|-------|
| Primary | bg `#EE4D2D`, white text, rounded-full or rounded-lg |
| Secondary | bg white, 1px `#111110` border, black text, rounded-full |
| Ghost | No bg/border, text only, hover: light gray bg |
| Danger | bg `#E0245E` (only for destructive actions) |

### Cards
- Background: white
- Border: 1px `#E8E8E6`
- Shadow: `0 1px 3px rgba(0,0,0,0.04)` (very subtle)
- Border radius: 16px (cards), 12px (nested product card), 999px (avatars, pills)
- Hover: shadow increases slightly

---

## Screens Required

### Desktop versions
1. **Trang chủ / Home Feed** — explore feed (công khai, không cần đăng nhập)
2. **Bảng tin** — following feed (yêu cầu đăng nhập)
3. **Chi tiết bài viết** — full post + comments thread
4. **Trang cá nhân** — profile grid + stats
5. **Thông báo** — notification list with tabs
6. **Đăng bài** — create post form with product URL input
7. **Đăng nhập / Đăng ký** — auth pages (clean, minimal, centered card)
8. **Cài đặt** — settings page (edit profile, password, notifications)
9. **Thống kê** — affiliate dashboard (clicks, earnings chart, top posts)

### Mobile versions (all of the above, mobile-first)

---

## Image & Media

- Product images: square `1:1` thumbnail in product preview card
- Review images: `4:3` cover, multi-image grid (2-up or carousel)
- Avatar: always circular, fallback = initials on `#F4F4F3` bg
- No full-bleed hero banners (this is a feed, not a landing page)

---

## Iconography

Use **Material Symbols Outlined** (Google) for all icons:
- `home` / `search` / `notifications` / `person` / `add_circle` / `rss_feed`
- `favorite` / `chat_bubble` / `repeat` / `share`
- `verified` (blue, filled) / `star` (yellow, filled for ratings)
- `shopping_bag` (inside Buy Now button)
- `bar_chart` / `settings` / `logout`

---

## Micro-interactions

- Like button: heart fills red with a small bounce animation
- Follow button: transitions "Theo dõi" → "Đang theo dõi" (border style)
- Post button: disabled (50% opacity) until textarea has content
- Card hover: shadow deepens (`0 4px 12px rgba(0,0,0,0.08)`)
- Nav active: text becomes bold, no color change (black, not orange)
