# Phase 01: Setup, Cleanup & Database Schema

**Links:** [Plan Overview](plan.md) | [Brainstorm](../reports/brainstorm-260621-2051-pivot-social-review-platform.md)

## Overview
- **Priority:** Critical (blocker cho tất cả phases khác)
- **Status:** Pending
- **Effort:** ~1 ngày

Xóa toàn bộ business logic cũ (Deals, Admin, Scheduler), giữ lại infra, và tạo database schema mới cho MXH.

## Files to Delete
```
apps/backend/src/deals/
apps/backend/src/scheduler/
apps/backend/src/auth/             (sẽ viết lại ở phase 02)
apps/backend/src/uploads/          (sẽ viết lại ở phase 05)
packages/database/prisma/migrations/  (xóa tất cả migration cũ)
packages/database/prisma/seed-sample-data.ts
```

## Files to Keep (Reuse)
```
apps/backend/src/scraper/          ✅ Giữ nguyên
apps/backend/src/categories/       ✅ Giữ nguyên (minor update)
apps/backend/src/prisma/           ✅ Giữ nguyên
apps/backend/src/main.ts           ✅ Cập nhật ports/config
apps/backend/src/app.module.ts     ✅ Cập nhật imports
docker-compose.yml                 ✅ Giữ nguyên
packages/database/src/index.ts    ✅ Giữ nguyên
```

## New Prisma Schema

File: `packages/database/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum NotificationType {
  LIKE
  COMMENT
  FOLLOW
  MENTION
}

model User {
  id              Int       @id @default(autoincrement())
  username        String    @unique @db.VarChar(50)
  email           String    @unique
  passwordHash    String?   @map("password_hash")
  googleId        String?   @unique @map("google_id")
  displayName     String    @map("display_name") @db.VarChar(100)
  bio             String?   @db.Text
  avatarUrl       String?   @map("avatar_url")
  emailVerified   Boolean   @default(false) @map("email_verified")  <!-- Updated: Validation Session 1 - email verification support -->
  totalClicks     Int       @default(0) @map("total_clicks")
  followersCount  Int       @default(0) @map("followers_count")
  followingCount  Int       @default(0) @map("following_count")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  posts           Post[]
  likes           Like[]
  comments        Comment[]
  followers       Follow[]  @relation("Following")
  following       Follow[]  @relation("Follower")
  notifications   Notification[] @relation("Recipient")
  actedNotifications Notification[] @relation("Actor")

  @@map("users")
}

model Post {
  id            Int       @id @default(autoincrement())
  userId        Int       @map("user_id")
  title         String    @db.VarChar(200)
  content       String?   @db.Text
  productUrl    String    @map("product_url")
  affiliateUrl  String    @map("affiliate_url")
  productMeta   Json?     @map("product_meta")
  images        String[]
  categoryId    Int?      @map("category_id")
  likeCount     Int       @default(0) @map("like_count")
  commentCount  Int       @default(0) @map("comment_count")
  clickCount    Int       @default(0) @map("click_count")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  category      Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  likes         Like[]
  comments      Comment[]
  clickLogs     ClickLog[]
  notifications Notification[]

  @@index([userId])
  @@index([categoryId])
  @@index([createdAt(sort: Desc)])
  @@map("posts")
}

model Follow {
  followerId  Int      @map("follower_id")
  followingId Int      @map("following_id")
  createdAt   DateTime @default(now()) @map("created_at")

  follower    User     @relation("Follower", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)

  @@id([followerId, followingId])
  @@index([followingId])
  @@map("follows")
}

model Like {
  userId    Int      @map("user_id")
  postId    Int      @map("post_id")
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@id([userId, postId])
  @@map("likes")
}

model Comment {
  id        Int       @id @default(autoincrement())
  userId    Int       @map("user_id")
  postId    Int       @map("post_id")
  parentId  Int?      @map("parent_id")
  content   String    @db.Text
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  parent    Comment?  @relation("Replies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("Replies")

  @@index([postId])
  @@index([userId])
  @@map("comments")
}

model ClickLog {
  id        Int      @id @default(autoincrement())
  postId    Int      @map("post_id")
  ip        String?
  userAgent String?  @map("user_agent")
  referer   String?
  createdAt DateTime @default(now()) @map("created_at")

  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
  @@index([createdAt])
  @@map("click_logs")
}

model Notification {
  id          Int              @id @default(autoincrement())
  recipientId Int              @map("recipient_id")
  type        NotificationType
  actorId     Int              @map("actor_id")
  postId      Int?             @map("post_id")
  read        Boolean          @default(false)
  createdAt   DateTime         @default(now()) @map("created_at")

  recipient   User             @relation("Recipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actor       User             @relation("Actor", fields: [actorId], references: [id], onDelete: Cascade)
  post        Post?            @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([recipientId, read])
  @@index([createdAt])
  @@map("notifications")
}

model Category {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  slug      String   @unique
  icon      String?
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  posts     Post[]

  @@map("categories")
}

// Cache kết quả scrape theo productUrl để giảm tần suất gọi Shopee (chống IP ban)
// <!-- Updated: Validation Session 2 - scrape cache table -->
model ScrapedProduct {
  id         Int      @id @default(autoincrement())
  productUrl String   @unique @map("product_url")
  data       Json     // ScrapedDealData JSON
  scrapedAt  DateTime @default(now()) @map("scraped_at")

  @@index([scrapedAt])
  @@map("scraped_products")
}
```

## Reserved Usernames (cho Phase 02)
<!-- Updated: Validation Session 2 - reserved username blocklist (path-based URL) -->
Vì dùng URL path-based `shopee.review/username`, username không được trùng static route. Tạo constant dùng chung:
```typescript
// apps/backend/src/common/reserved-usernames.ts
export const RESERVED_USERNAMES = [
  'create', 'feed', 'search', 'dashboard', 'settings', 'auth',
  'admin', 'api', 'r', 'login', 'register', 'logout', 'verify',
  'about', 'help', 'explore', 'notifications', 'u', 'category',
  'terms', 'privacy', 'contact', 'support', 'static', '_next',
];
```

## Implementation Steps

1. **Backup** (nếu cần): `git checkout -b pivot/social-platform`
2. Xóa các module cũ: `deals/`, `scheduler/`, `auth/`, `uploads/` trong `apps/backend/src/`
3. Xóa tất cả migrations cũ trong `packages/database/prisma/migrations/`
4. Thay thế `packages/database/prisma/schema.prisma` với schema mới ở trên
5. Cập nhật `apps/backend/src/app.module.ts` — xóa imports cũ, chỉ giữ `PrismaModule`, `CategoriesModule`, `ScraperModule`
6. Chạy `pnpm db:generate` để generate Prisma client
7. Chạy `pnpm db:migrate --name initial_social_schema` để tạo migration đầu tiên
8. Verify: `pnpm build` không có lỗi

## Todo
- [ ] Tạo git branch mới: `pivot/social-platform`
- [ ] Xóa module cũ (deals, scheduler, auth, uploads)
- [ ] Viết schema.prisma mới
- [ ] Drop DB cũ, chạy migration mới
- [ ] Update app.module.ts
- [ ] Build verify

## Success Criteria
- `pnpm build` compile thành công không có lỗi
- `pnpm db:migrate` chạy thành công
- Prisma Studio hiển thị đúng 7 tables mới
