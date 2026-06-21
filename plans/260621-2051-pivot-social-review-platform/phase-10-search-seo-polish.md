# Phase 10: Search, SEO & Polish

**Links:** [Plan Overview](plan.md) | [Phase 09](phase-09-frontend-redesign.md)  
**Depends on:** Phase 09

## Overview
- **Priority:** Low
- **Status:** Pending
- **Effort:** ~1 ngày

Full-text search, SEO optimization, trending algorithm, sitemap, và các polish cuối cùng trước launch.

## Backend: Search

### PostgreSQL Full-Text Search
Không cần infra thêm — dùng `tsvector` của PostgreSQL.

```sql
-- Add GIN index cho search (trong migration)
ALTER TABLE posts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;
CREATE INDEX posts_search_idx ON posts USING GIN(search_vector);
```

Hoặc đơn giản hơn dùng Prisma raw query:
```typescript
// posts.service.ts
async search(query: string, page: number) {
  return this.prisma.$queryRaw`
    SELECT p.*, u.username, u.display_name, u.avatar_url
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE to_tsvector('simple', p.title || ' ' || coalesce(p.content, ''))
      @@ plainto_tsquery('simple', ${query})
    ORDER BY ts_rank(
      to_tsvector('simple', p.title || ' ' || coalesce(p.content, '')),
      plainto_tsquery('simple', ${query})
    ) DESC
    LIMIT 20 OFFSET ${(page - 1) * 20}
  `;
}
```

### Search Endpoints
```
GET /api/search?q=&type=posts|users|all&page=1
```

Response:
```typescript
{
  posts: Post[],
  users: UserProfile[],
  meta: { total, page, limit }
}
```

### Trending Algorithm
```typescript
// GET /api/posts/trending
// Score = clicks * 0.4 + likes * 0.3 + comments * 0.3
// Trong khoảng 7 ngày qua

async getTrending(limit = 20) {
  return this.prisma.$queryRaw`
    SELECT *, 
      (click_count * 0.4 + like_count * 0.3 + comment_count * 0.3) as score
    FROM posts
    WHERE created_at >= NOW() - INTERVAL '7 days'
    ORDER BY score DESC
    LIMIT ${limit}
  `;
}
```

## Frontend: Search Page

### `app/search/page.tsx`
```
/search?q=iphone
┌────────────────────────────────────────┐
│  🔍 [Search input]                     │
│  Tabs: [Bài viết] [Người dùng]         │
├────────────────────────────────────────┤
│  Kết quả cho "iphone" — 23 bài viết   │
│  [PostCard grid]                       │
│  hoặc                                  │
│  [UserCard list]                       │
└────────────────────────────────────────┘
```

**Search debounce:** 500ms trước khi gọi API.  
**URL sync:** Query param `?q=...` sync với URL (dùng `useSearchParams`).

## SEO Optimization

### Sitemap (`app/sitemap.ts`)
```typescript
export default async function sitemap() {
  const posts = await fetchRecentPosts(1000);
  const users = await fetchActiveUsers(500);

  return [
    { url: 'https://shopee.review', changeFrequency: 'hourly' },
    { url: 'https://shopee.review/search', changeFrequency: 'daily' },
    ...users.map(u => ({
      url: `https://shopee.review/${u.username}`,
      changeFrequency: 'daily',
    })),
    ...posts.map(p => ({
      url: `https://shopee.review/${p.user.username}/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly',
    })),
  ];
}
```

### robots.txt (`app/robots.ts`)
```typescript
export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/settings', '/feed'] }],
    sitemap: 'https://shopee.review/sitemap.xml',
  };
}
```

### Structured Data (JSON-LD) cho Post Detail
```tsx
// Trong post detail page
<script type="application/ld+json">{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Review",
  "itemReviewed": { "@type": "Product", "name": post.title },
  "author": { "@type": "Person", "name": post.user.displayName },
  "datePublished": post.createdAt,
})}</script>
```

## Polish Items

### Rate Limiting (Review)
- `POST /posts`: 10 posts/hour per user (chống spam)
- `POST /posts/:id/comments`: 30 comments/hour per user

### Image Optimization
- Dùng Next.js `<Image>` component với R2 domain trong `next.config.ts`
- Add R2 domain vào `remotePatterns`

### Error Pages
```
app/not-found.tsx       → 404 page (profile không tồn tại, post không tồn tại)
app/error.tsx           → Generic error boundary
```

### Loading States
- Skeleton screens cho tất cả data fetching
- Suspense boundaries trong Next.js App Router

### Share Button
- Web Share API (native mobile share)
- Fallback: copy link to clipboard

## Affiliate ID Settings
Trong `/settings` page, thêm section:
```
🔗 Affiliate ID Shopee
Nhập Affiliate ID của bạn để tự động tạo link affiliate khi đăng bài.
[Input: affiliate ID]  [Lưu]
ℹ️ Đăng ký tại: affiliate.shopee.vn
```

## Todo
- [ ] Implement PostgreSQL FTS search endpoint
- [ ] Implement trending algorithm
- [ ] Frontend: `/search` page
- [ ] Add `sitemap.ts` + `robots.ts`
- [ ] Add JSON-LD structured data cho posts
- [ ] Add R2 domain vào `next.config.ts` remotePatterns
- [ ] Add 404 + error pages
- [ ] Add rate limiting cho post creation
- [ ] Add affiliate ID settings trong `/settings`
- [ ] Performance audit (Lighthouse)
- [ ] Test toàn bộ luồng end-to-end

## Success Criteria
- Search hoạt động với tiếng Việt (no-accent search)
- Sitemap accessible tại `/sitemap.xml`
- Lighthouse score ≥ 80 cho Performance, SEO
- Tất cả error cases có UI phù hợp
- Share button hoạt động trên mobile
