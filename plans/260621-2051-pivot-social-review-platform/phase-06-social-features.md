# Phase 06: Social Features (Follows / Likes / Comments)

**Links:** [Plan Overview](plan.md) | [Phase 05](phase-05-cloudflare-r2-uploads.md)  
**Depends on:** Phase 05

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** ~1.5 ngày

Tương tác xã hội cốt lõi: follow/unfollow user, like/unlike post, comment (có reply lồng nhau 1 level).

## Backend: SocialModule

### Files to Create
```
apps/backend/src/social/
├── social.module.ts
├── follows.controller.ts     (/users/:username/follow, /users/:username/unfollow)
├── likes.controller.ts       (/posts/:id/like, /posts/:id/unlike)
├── comments.controller.ts    (/posts/:id/comments)
└── social.service.ts
```

### API Endpoints
```
# Follows (JWT required)
POST   /api/users/:username/follow      → follow user
DELETE /api/users/:username/follow      → unfollow user
GET    /api/users/:username/followers   → list followers (public)
GET    /api/users/:username/following   → list following (public)

# Likes (JWT required)
POST   /api/posts/:id/like              → like post
DELETE /api/posts/:id/like              → unlike post
GET    /api/posts/:id/likes/count       → like count + isLiked (cho current user)

# Comments
GET    /api/posts/:id/comments          → list comments (public, paginated)
POST   /api/posts/:id/comments          → add comment (JWT required)
DELETE /api/comments/:id               → delete own comment (JWT required)
```

### social.service.ts — Key methods
```typescript
follow(followerId: number, targetUsername: string): Promise<void>
unfollow(followerId: number, targetUsername: string): Promise<void>
isFollowing(followerId: number, targetId: number): Promise<boolean>

likePost(userId: number, postId: number): Promise<void>
unlikePost(userId: number, postId: number): Promise<void>
isLiked(userId: number, postId: number): Promise<boolean>

// cursor-based pagination <!-- Updated: Validation Session 2 -->
getComments(postId: number, cursor?: number, limit = 20): Promise<{ data: Comment[], nextCursor: number | null }>
addComment(userId: number, postId: number, content: string, parentId?: number): Promise<Comment>
deleteComment(userId: number, commentId: number): Promise<void>
```

**Counter updates (denormalized):**
- Like → `UPDATE posts SET like_count = like_count + 1` (atomic)
- Follow → `UPDATE users SET followers_count = followers_count + 1` (cho target), `following_count + 1` (cho follower)
- Comment → `UPDATE posts SET comment_count = comment_count + 1`
- Dùng Prisma transaction để đảm bảo atomicity

**Comments structure (1 level reply):**
- `parentId = null` → top-level comment
- `parentId = commentId` → reply to comment
- Không hỗ trợ reply lồng sâu hơn 1 level (keep it simple)

**Response cho GET /comments:**
```typescript
{
  data: Comment[],  // top-level comments với replies[] nested
  meta: { total, page, limit }
}
```

## Frontend: Social Components

### Files to Create
```
apps/frontend/src/components/
├── follow-button.tsx              (Follow/Unfollow toggle)
├── like-button.tsx                (Like/Unlike toggle với count)
├── comments-section.tsx           (list + add comment)
└── comment-item.tsx               (single comment + replies)
```

**follow-button.tsx:**
- Optimistic update: toggle UI ngay, gọi API, rollback nếu lỗi
- Disabled khi user xem profile của chính mình

**like-button.tsx:**
- Optimistic update tương tự
- Heart animation khi like

**comments-section.tsx:**
- Load comments lazy (khi user scroll tới)
- Textarea submit on Ctrl+Enter
- Reply: click "Trả lời" → indent form bên dưới comment đó

## Notification Triggers (chuẩn bị cho Phase 07)
Trong `social.service.ts`, sau khi follow/like/comment thành công, gọi `NotificationsService.create()`:
```typescript
// Khi like post
await this.notificationsService.create({
  recipientId: post.userId,
  type: 'LIKE',
  actorId: userId,
  postId: postId,
});

// Khi follow
await this.notificationsService.create({
  recipientId: targetUser.id,
  type: 'FOLLOW',
  actorId: followerId,
});

// Khi comment
await this.notificationsService.create({
  recipientId: post.userId,
  type: 'COMMENT',
  actorId: userId,
  postId: postId,
});
```

`NotificationsService` inject vào `SocialModule` — implement cơ bản ở phase này (chỉ save to DB), SSE ở Phase 07.

## Todo
- [ ] Tạo `SocialModule` + controllers + service
- [ ] Implement follow/unfollow với counter updates (transaction)
- [ ] Implement like/unlike với counter updates
- [ ] Implement comments CRUD
- [ ] Frontend: `FollowButton`, `LikeButton`
- [ ] Frontend: `CommentsSection` + `CommentItem`
- [ ] Wire vào post detail page và profile page
- [ ] Test: follow → unfollow → count đúng; like → unlike → count đúng

## Success Criteria
- Follow/unfollow: counter cập nhật đúng, không duplicate
- Like/unlike: idempotent (like 2 lần = 1 like)
- Comment: hiển thị đúng hierarchy 1 level
- Tất cả optimistic updates hoạt động smooth
