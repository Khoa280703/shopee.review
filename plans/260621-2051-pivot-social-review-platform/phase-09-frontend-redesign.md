# Phase 09: Frontend Complete Redesign

**Links:** [Plan Overview](plan.md) | [Phase 08](phase-08-click-tracking-analytics.md)  
**Depends on:** Phase 08 (hoặc có thể làm song song từ Phase 04+)

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** ~2 ngày

Thiết kế lại toàn bộ UI/UX theo hướng MXH — clean, modern, mobile-first. Tất cả pages cần redesign.

## Design Direction
- **Vibe:** Instagram meets Reddit — card-based, visual-heavy
- **Color:** Tông cam/đỏ Shopee làm accent, nền trắng/xám nhẹ
- **Mobile-first:** Responsive, touch-friendly
- **Font:** System font stack (performance)

## Site Architecture & Routes

```
/ (public)           → Home feed: trending posts, mới nhất
/feed (auth)         → Personal newsfeed
/[username]          → User profile
/[username]/[postId] → Post detail
/create (auth)       → Create post
/dashboard (auth)    → Analytics
/settings (auth)     → Profile settings
/search              → Search
/category/[slug]     → Category posts
/auth/login
/auth/register
/r/[postId]          → Click redirect (no UI)
```

## Layout Structure

### Root Layout (`app/layout.tsx`)
```
<html>
  <body>
    <AuthProvider>
      <Header />        ← logo, search, nav, notification bell, avatar
      {children}
      <MobileNav />     ← bottom nav for mobile (Home, Search, Create, Feed, Profile)
    </AuthProvider>
  </body>
</html>
```

### Header Component
```
Desktop:
[Logo: shopee.review] [Search bar] [Feed] [Create] [🔔 3] [@username ▾]

Mobile:
[Logo] [🔔 3] [@username avatar]
Bottom nav: [🏠] [🔍] [➕] [📰] [👤]
```

## Key Pages

### Home (`/`) — Public Feed
```
┌─────────────────────────────────────────┐
│  Header                                 │
├─────────────────────────────────────────┤
│  Category pills: [Tất cả][Thời trang]... │
├──────────────────┬──────────────────────┤
│  Post cards grid │  (desktop: 3 cols)   │
│  [card][card]    │  (mobile: 1 col)     │
│  [card][card]    │                      │
│  [Load More]     │                      │
└──────────────────┴──────────────────────┘
```

### Post Card Component
```
┌─────────────────────┐
│ [Product Image]     │
│ ████████████        │
├─────────────────────┤
│ @username · 2h ago  │
│ Tiêu đề bài review  │
│ ~~299k~~ → 149k (-50%)│
│ ⭐ 4.8 · Đã bán 1.2k │
├─────────────────────┤
│ ❤️ 12  💬 5  🔗 Click│
│ [Mua ngay →]        │
└─────────────────────┘
```

### Post Detail (`/[username]/[postId]`) — SSR
```
┌─────────────────────────────────────────┐
│  ← Back  |  Share                       │
├─────────────────────────────────────────┤
│  [Image carousel]                       │
├─────────────────────────────────────────┤
│  @username  [Follow]                    │
│  Tiêu đề bài viết                       │
│  ~~Giá gốc~~ → Giá sale  -XX%          │
│  ⭐ Rating · Đã bán                     │
│  [🔗 Mua ngay trên Shopee →]           │
├─────────────────────────────────────────┤
│  📝 Nội dung review của user            │
│  ...                                    │
├─────────────────────────────────────────┤
│  ❤️ 12 thích  💬 5 bình luận           │
│  [❤️ Thích]  [💬 Bình luận]            │
├─────────────────────────────────────────┤
│  Bình luận                              │
│  [Comment list + reply form]            │
└─────────────────────────────────────────┘
```

### Profile (`/[username]`)
```
┌─────────────────────────────────────────┐
│  [Avatar 80px]  username                │
│                 Display Name            │
│                 Bio text                │
│                 X bài · Y followers · Z following │
│                 [Follow] / [Chỉnh sửa] │
├─────────────────────────────────────────┤
│  [Tab: Bài viết] [Tab: Đã thích]        │
├─────────────────────────────────────────┤
│  Post grid (3 cols) / list              │
└─────────────────────────────────────────┘
```

### Create Post (`/create`)
```
┌─────────────────────────────────────────┐
│  Tạo bài review                         │
├─────────────────────────────────────────┤
│  🔗 Link sản phẩm Shopee               │
│  [URL input + 🔍 auto-scrape]          │
│  [Product preview card khi scrape xong]│
├─────────────────────────────────────────┤
│  📸 Ảnh sản phẩm                       │
│  [Image uploader - drag & drop]        │
├─────────────────────────────────────────┤
│  📝 Tiêu đề bài review                 │
│  [Input]                               │
├─────────────────────────────────────────┤
│  💭 Nội dung review                    │
│  [Textarea - markdown optional]        │
├─────────────────────────────────────────┤
│  🏷️ Link affiliate của bạn            │
│  [URL input - auto-generated nếu có ID]│
├─────────────────────────────────────────┤
│  📁 Danh mục                           │
│  [Category select]                     │
├─────────────────────────────────────────┤
│  [Hủy]  [Đăng bài →]                  │
└─────────────────────────────────────────┘
```

## Component Hierarchy

```
components/
├── layout/
│   ├── header.tsx
│   ├── mobile-nav.tsx
│   └── page-container.tsx
├── post/
│   ├── post-card.tsx
│   ├── post-grid.tsx
│   ├── post-detail-header.tsx
│   ├── product-info-card.tsx
│   └── image-carousel.tsx
├── social/
│   ├── follow-button.tsx
│   ├── like-button.tsx
│   ├── comments-section.tsx
│   └── comment-item.tsx
├── forms/
│   ├── post-form.tsx
│   ├── shopee-url-input.tsx
│   └── image-uploader.tsx
├── user/
│   ├── user-avatar.tsx
│   ├── user-profile-header.tsx
│   └── user-card.tsx
├── notifications/
│   ├── notification-bell.tsx
│   ├── notification-dropdown.tsx
│   └── notification-item.tsx
├── ui/
│   ├── button.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   ├── skeleton.tsx          (loading states)
│   ├── category-pills.tsx
│   └── price-display.tsx
└── analytics/
    ├── stats-overview.tsx
    ├── click-chart.tsx
    └── post-stats-table.tsx
```

## OG Meta Tags (SEO)
Mỗi post detail page cần:
```tsx
// app/[username]/[postId]/page.tsx
export async function generateMetadata({ params }) {
  const post = await fetchPost(params.postId);
  return {
    title: `${post.title} - ${post.user.displayName} | shopee.review`,
    description: post.content?.slice(0, 160),
    openGraph: {
      images: [post.images[0]],
      type: 'article',
    }
  };
}
```

## Dependencies (mới cho Frontend)
```bash
pnpm --filter @app/frontend add recharts    # cho analytics chart
# Không cần thêm gì khác — Tailwind + Lucide đã có
```

## Todo
- [ ] Thiết kế + implement `Header` + `MobileNav`
- [ ] Redesign home page với category pills + grid
- [ ] Implement `PostCard` component
- [ ] Implement `PostDetail` page với SSR metadata
- [ ] Redesign Profile page
- [ ] Create Post page (wire vào form từ phase 04)
- [ ] Settings page (update profile, avatar upload, affiliate ID)
- [ ] Search page (wire vào phase 10)
- [ ] Dashboard page (wire vào phase 08)
- [ ] Test responsive: mobile + tablet + desktop

## Success Criteria
- Tất cả pages responsive hoạt động tốt trên mobile
- OG tags đúng cho post detail (test bằng og:debugger)
- Loading states (skeleton) cho tất cả async data
- Navigation đúng, không có broken links
