# Phase 04: Posts Module + Scraper Integration

**Links:** [Plan Overview](plan.md) | [Phase 03](phase-03-users-profiles.md)  
**Depends on:** Phase 03

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** ~1.5 ngày

Core feature: User tạo post review sản phẩm Shopee. Khi paste URL Shopee, platform tự scrape thông tin sản phẩm và gợi ý điền vào form.

## Backend: PostsModule

### Files to Create
```
apps/backend/src/posts/
├── posts.module.ts
├── posts.controller.ts       (public endpoints)
├── posts-me.controller.ts    (authenticated endpoints)
├── posts.service.ts
└── dto/
    ├── create-post.dto.ts
    ├── update-post.dto.ts
    └── query-posts.dto.ts
```

### API Endpoints
```
# Public
GET  /api/posts                    → list posts (page, limit, categoryId, search, sortBy)
GET  /api/posts/:id                → single post detail
GET  /api/posts/trending           → trending posts (last 7 days, sorted by clicks+likes)

# Authenticated (JWT required)
POST /api/posts/scrape             → scrape Shopee URL, return scraped data
POST /api/posts                    → tạo post mới
PATCH /api/posts/:id               → update post (chỉ owner)
DELETE /api/posts/:id              → delete post (chỉ owner)
```

### DTOs

<!-- Updated: Validation Session 1 - affiliateUrl required, emailVerified check -->
**create-post.dto.ts**
```typescript
export class CreatePostDto {
  @IsString() @MaxLength(200)
  title: string;

  @IsOptional() @IsString() @MaxLength(5000)
  content?: string;

  @IsUrl()
  productUrl: string;

  @IsUrl()  // Required — user phải tự nhập link affiliate từ Shopee Affiliate Program
  affiliateUrl: string;

  @IsOptional() @IsObject()
  productMeta?: {
    shopName?: string;
    originalPrice?: number;
    salePrice?: number;
    discountPercent?: number;
    rating?: number;
    soldCount?: number;
  };

  @IsArray() @IsUrl({}, { each: true }) @ArrayMaxSize(10)
  images: string[];

  @IsOptional() @IsInt() @IsPositive()
  categoryId?: number;
}
```

**query-posts.dto.ts** <!-- Updated: Validation Session 2 - cursor-based pagination -->
```typescript
export class QueryPostsDto {
  // Cursor-based: cursor = id của post cuối cùng trang trước
  @IsOptional() @IsInt() @Type(() => Number)
  cursor?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50) @Type(() => Number)
  limit?: number = 20;

  @IsOptional() @IsInt() @Type(() => Number)
  categoryId?: number;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsIn(['createdAt', 'clickCount', 'likeCount'])
  sortBy?: string = 'createdAt';
}
```

### posts.service.ts — Key methods
```typescript
// cursor-based: trả { data, nextCursor }
findAll(dto: QueryPostsDto): Promise<{ data: Post[], nextCursor: number | null }>
findOne(id: number): Promise<Post>
getTrending(): Promise<Post[]>
create(userId: number, dto: CreatePostDto): Promise<Post>
update(userId: number, postId: number, dto: UpdatePostDto): Promise<Post>
remove(userId: number, postId: number): Promise<void>
scrapeUrl(url: string): Promise<ScrapedDealData>  // qua ScraperProvider + cache
```

**Cursor pagination pattern:**
```typescript
const posts = await this.prisma.post.findMany({
  take: limit + 1,  // lấy dư 1 để biết còn trang sau không
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  orderBy: { createdAt: 'desc' },
  where: { /* categoryId, search... */ },
});
const hasMore = posts.length > limit;
const data = hasMore ? posts.slice(0, limit) : posts;
const nextCursor = hasMore ? data[data.length - 1].id : null;
return { data, nextCursor };
```

**Affiliate link:** `affiliateUrl` là required field. Scraper trả về raw Shopee URL trong `productUrl`; user **phải tự nhập** affiliate link riêng (lấy từ Shopee Affiliate Program). Không auto-generate.

**Email verification gate:** Backend check `user.emailVerified` trước khi tạo post:
```typescript
if (!user.emailVerified) {
  throw new ForbiddenException('Vui lòng xác minh email trước khi đăng bài');
}
```

### ScraperModule Integration + Cache Layer
<!-- Updated: Validation Session 2 - scrape cache + ScraperProvider abstraction + rate limit -->
`PostsModule` inject `ScraperModule`. Thêm 2 lớp bảo vệ chống Shopee ban IP:

**1. Cache layer (`scraped_products` table — Phase 01):**
```typescript
async scrapeUrl(url: string): Promise<ScrapedDealData> {
  const normalized = normalizeShopeeUrl(url);  // bỏ tracking params

  // Check cache (TTL 24h)
  const cached = await this.prisma.scrapedProduct.findUnique({
    where: { productUrl: normalized },
  });
  if (cached && Date.now() - cached.scrapedAt.getTime() < 24 * 3600_000) {
    return cached.data as ScrapedDealData;
  }

  // Cache miss → scrape qua provider
  const data = await this.scraperProvider.scrape(normalized);

  // Upsert cache
  await this.prisma.scrapedProduct.upsert({
    where: { productUrl: normalized },
    create: { productUrl: normalized, data },
    update: { data, scrapedAt: new Date() },
  });
  return data;
}
```
→ Nhiều user review cùng 1 sản phẩm chỉ scrape **1 lần** trong 24h.

**2. ScraperProvider abstraction:**
Tạo interface để sau cắm proxy/browser pool mà không phải viết lại:
```typescript
// apps/backend/src/scraper/scraper-provider.interface.ts
export interface ScraperProvider {
  scrape(url: string): Promise<ScrapedDealData>;
}
// MVP: DirectScraperProvider (wrap ScraperService hiện tại, scrape trực tiếp)
// Tương lai: ProxyPoolScraperProvider (nhiều Playwright + rotating proxy)
//   → swap bằng DI, không đổi PostsService
```

**3. Rate limit scrape:** `POST /posts/scrape` throttle 20 requests/giờ/user (giảm áp lực lên scraper + chống abuse).

> ⏭️ **Defer:** Proxy/browser pool (nhiều Playwright + rotating proxy) là phase hạ tầng riêng — triển khai sau khi test tải xác định cần thiết. Abstraction ở trên đảm bảo plug vào không phá vỡ code.

## Frontend: Post Pages

### Files to Create
```
apps/frontend/src/app/
├── create/page.tsx                    (tạo post mới - protected)
├── [username]/[postId]/page.tsx       (post detail - public, SSR)
└── page.tsx                           (update: public feed)

apps/frontend/src/components/
├── post-card.tsx                      (card trong feed/grid)
├── post-form/
│   ├── post-form.tsx                  (main form component)
│   ├── shopee-url-input.tsx           (URL input + auto-scrape trigger)
│   └── product-meta-preview.tsx      (preview scraped data)
└── post-detail/
    ├── post-header.tsx
    └── product-info-card.tsx
```

### Create Post Flow (UX)
```
1. User truy cập /create
2. Paste Shopee URL vào input → auto trigger scrape (debounce 800ms)
3. Loading indicator trong khi scrape
4. Scraped data điền vào form:
   - title, images (chọn ảnh), productMeta
5. User **tự nhập affiliateUrl** (bắt buộc) — paste link từ Shopee Affiliate Program
6. User viết content (review text)
7. Chọn category
8. Submit → POST /api/posts
9. Redirect → /[username]/[postId]
```
<!-- Updated: Validation Session 2 - affiliateUrl required (không auto-generate) -->

### Post Card Component
```tsx
// Hiển thị trong feed/grid
<PostCard>
  <img src={images[0]} />
  <span>@username</span>
  <h3>{title}</h3>
  <ProductPrice original={...} sale={...} discount={...} />
  <div>👍 {likeCount}  💬 {commentCount}  🔗 {clickCount}</div>
  <a href={`/r/${id}`}>Mua ngay →</a>
</PostCard>
```

## Todo
- [ ] Tạo `PostsModule` + controllers + service
- [ ] Wire `ScraperModule` vào `PostsModule`
- [ ] Tạo `ScraperProvider` interface + `DirectScraperProvider` (wrap ScraperService)
- [ ] Implement cache layer (`scraped_products`): check cache 24h trước scrape, upsert sau scrape
- [ ] Implement `POST /posts/scrape` + rate limit 20/giờ/user
- [ ] Implement CRUD posts endpoints với cursor pagination
- [ ] Frontend: `/create` page với form + auto-scrape + input affiliateUrl bắt buộc
- [ ] Frontend: `PostCard` component
- [ ] Frontend: Post detail page `[username]/[postId]`
- [ ] Frontend: Public feed hiển thị `PostCard` grid (cursor "Load More")
- [ ] Test: tạo post từ Shopee URL thành công end-to-end
- [ ] Test: scrape lần 2 cùng URL → lấy từ cache (không gọi Shopee)

## Success Criteria
- Paste Shopee URL → form tự điền thông tin sản phẩm
- Tạo post thành công → hiển thị trên feed
- Post detail page render đúng (SSR với metadata cho SEO)
- Chỉ owner mới update/delete được post của mình
