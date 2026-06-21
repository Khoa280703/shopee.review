# Phase 03: Users & Profile Module

**Links:** [Plan Overview](plan.md) | [Phase 02](phase-02-auth-system.md)  
**Depends on:** Phase 02

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** ~1 ngày

CRUD profile user, trang `/[username]` hiển thị profile + posts của user.

## Backend: UsersModule

### Files to Create
```
apps/backend/src/users/
├── users.module.ts
├── users.controller.ts    (GET /users/:username, PATCH /users/me, GET /users/:username/stats)
├── users.service.ts
└── dto/
    └── update-profile.dto.ts
```

### API Endpoints
```
GET  /api/users/:username          → public profile (displayName, bio, avatar, stats)
PATCH /api/users/me                → update own profile (JWT required)
GET  /api/users/:username/posts    → posts của user này (paginated)
GET  /api/users/search?q=          → tìm kiếm user theo username/displayName
```

**update-profile.dto.ts**
```typescript
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(500)
  bio?: string;

  @IsOptional() @IsUrl()
  avatarUrl?: string;  // URL từ R2 sau khi upload
}
```

**users.service.ts** — Key methods:
```typescript
findByUsername(username: string): Promise<UserProfile>
updateProfile(userId: number, dto: UpdateProfileDto): Promise<UserProfile>
// cursor-based pagination <!-- Updated: Validation Session 2 -->
getUserPosts(username: string, cursor?: number, limit = 20): Promise<{ data: Post[], nextCursor: number | null }>
searchUsers(query: string): Promise<UserProfile[]>
getUserStats(userId: number): Promise<{ totalClicks, totalPosts, followersCount, followingCount }>
```

**Response shape `UserProfile`:**
```typescript
{
  id, username, displayName, bio, avatarUrl,
  totalClicks, followersCount, followingCount,
  totalPosts,  // computed from posts count
  createdAt
}
```

## Frontend: Profile Page

### Files to Create
```
apps/frontend/src/app/[username]/
└── page.tsx               (SSR: server component fetch profile + initial posts)
```

**⚠️ Route Conflict Solution:**  
Trong Next.js App Router, static segments (`/create`, `/feed`, `/auth`, `/search`, `/category`, `/dashboard`, `/settings`, `/r`) được ưu tiên hơn `[username]` dynamic segment. Chỉ cần đảm bảo tất cả static pages được tạo trong `src/app/` trước khi có `[username]/`.

**Hai lớp bảo vệ** <!-- Updated: Validation Session 2 - reserved username blocklist -->:
1. Next.js tự ưu tiên static route hơn dynamic — frontend không bao giờ render nhầm
2. Backend `RESERVED_USERNAMES` blocklist (Phase 01/02) chặn user đăng ký các username trùng static route ngay từ đầu → tránh user "mồ côi" không truy cập được profile

### Profile Page Layout
<!-- Updated: Validation Session 2 - bỏ nút [Message] (DM out of MVP scope) -->
```
┌─────────────────────────────────────┐
│  Avatar  |  username                │
│          |  Bio                     │
│          |  X posts · Y followers   │
│          |  [Follow]                │
├─────────────────────────────────────┤
│  Posts grid (3 columns)             │
│  [post card] [post card] [post card]│
│  ...                                │
│  [Load More] (cursor-based)         │
└─────────────────────────────────────┘
```
**Lưu ý:** DM (nhắn tin) ngoài scope MVP — không có nút Message.

### Components to Create
```
apps/frontend/src/components/
├── user-profile-header.tsx    (avatar, bio, stats, follow button)
└── post-grid.tsx              (responsive grid of post cards)
```

## Todo
- [ ] Tạo `UsersModule` + controller + service
- [ ] Implement `GET /users/:username` endpoint
- [ ] Implement `PATCH /users/me` endpoint
- [ ] Frontend: tạo `app/[username]/page.tsx`
- [ ] Frontend: `UserProfileHeader` component
- [ ] Test: truy cập `shopee.review/khoa2807` hiển thị đúng profile

## Success Criteria
- `GET /api/users/khoa2807` trả về profile data đầy đủ
- Trang `/[username]` render đúng (SSR)
- Static routes (`/create`, `/feed`) không bị override bởi `/[username]`
- Update profile lưu thành công
