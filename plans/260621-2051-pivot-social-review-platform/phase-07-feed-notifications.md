# Phase 07: Feed & SSE Notifications

**Links:** [Plan Overview](plan.md) | [Phase 06](phase-06-social-features.md)  
**Depends on:** Phase 06

## Overview
- **Priority:** Medium
- **Status:** Pending
- **Effort:** ~1 ngày

Personal newsfeed (posts từ followed users) + real-time notifications qua SSE.

## Backend: FeedModule

### Files to Create
```
apps/backend/src/feed/
├── feed.module.ts
└── feed.controller.ts    (GET /feed)
```

### GET /api/feed
```typescript
// JWT required (cookie)
// Returns posts from users that current user follows
// Sorted by createdAt DESC
// Cursor-based pagination <!-- Updated: Validation Session 2 -->

async getFeed(userId: number, cursor?: number, limit = 20) {
  const posts = await this.prisma.post.findMany({
    where: {
      user: { followers: { some: { followerId: userId } } }
    },
    include: {
      user: { select: { username, displayName, avatarUrl } },
      category: true,
      _count: { select: { likes: true, comments: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,  // lấy dư 1 để xác định nextCursor
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
  const hasMore = posts.length > limit;
  const data = hasMore ? posts.slice(0, limit) : posts;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
}
```

**Fan-out-on-read** cho MVP — đủ đơn giản, không cần Redis.  
Optimize sau khi có >1000 users active.

## Backend: NotificationsModule

### Files to Create
```
apps/backend/src/notifications/
├── notifications.module.ts
├── notifications.controller.ts    (GET /notifications, PATCH /notifications/read-all, SSE /notifications/stream)
└── notifications.service.ts
```

### SSE Implementation
```typescript
// notifications.controller.ts
@Get('stream')
@UseGuards(JwtAuthGuard)
@Sse()
stream(@CurrentUser() user: User): Observable<MessageEvent> {
  return this.notificationsService.createStream(user.id);
}

// notifications.service.ts
private readonly streams = new Map<number, Subject<MessageEvent>>();

createStream(userId: number): Observable<MessageEvent> {
  if (!this.streams.has(userId)) {
    this.streams.set(userId, new Subject());
  }
  return this.streams.get(userId).asObservable().pipe(
    // Heartbeat mỗi 30s để giữ connection
    merge(interval(30000).pipe(map(() => ({ data: 'ping' }))))
  );
}

// Gọi khi có notification mới (từ SocialService)
async create(data: CreateNotificationDto) {
  const notification = await this.prisma.notification.create({ data });
  
  const stream = this.streams.get(data.recipientId);
  if (stream) {
    stream.next({ data: JSON.stringify(notification) });
  }
  
  return notification;
}
```

### API Endpoints
```
GET  /api/notifications               → list unread notifications (JWT)
PATCH /api/notifications/read-all    → mark all as read (JWT)
GET  /api/notifications/stream       → SSE stream (JWT)
```

**Note:** SSE connection limit — mỗi browser mở tối đa 6 connections per domain. SSE dùng 1 connection. Không vấn đề cho MVP.

## Frontend: Feed Page + Notifications

### Files to Create
```
apps/frontend/src/app/
└── feed/page.tsx                   (personal newsfeed - protected)

apps/frontend/src/components/
├── notification-bell.tsx           (icon + badge trong header)
├── notification-dropdown.tsx       (list notifications)
└── notification-item.tsx           (single notification)

apps/frontend/src/hooks/
└── use-notifications.ts            (SSE client + state management)
```

**use-notifications.ts:**
```typescript
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // withCredentials: true → browser tự gửi HttpOnly Cookie
    // Không cần query param vì dùng cookie auth
    const eventSource = new EventSource('/api/notifications/stream', {
      withCredentials: true,
    });

    eventSource.onmessage = (e) => {
      if (e.data === 'ping') return;
      const notification = JSON.parse(e.data);
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    return () => eventSource.close();
  }, []);

  return { notifications, unreadCount, markAllRead };
}
```

**SSE + Cookie Auth:** Vì dùng HttpOnly Cookie, `withCredentials: true` tự động gửi cookie trong SSE request. Backend đọc JWT từ cookie thay vì query param:
```typescript
// notifications.controller.ts
@Get('stream')
@UseGuards(JwtAuthGuard)  // đọc JWT từ req.cookies.auth_token
@Sse()
stream(@CurrentUser() user: User): Observable<MessageEvent> {
  return this.notificationsService.createStream(user.id);
}
```
Cần ensure CORS config cho backend cho phép `credentials: true` từ frontend origin.
<!-- Updated: Validation Session 1 - withCredentials cookie auth thay vì query param -->

### Feed Page Layout
```
/feed
├── Header: "Bảng tin của bạn"
├── Empty state: "Hãy follow ai đó để xem bài viết của họ"
└── PostCard list (vertical scroll, lazy load)
```

**Notification types hiển thị:**
- ❤️ `@username đã thích bài review của bạn`
- 💬 `@username đã bình luận về bài review của bạn`
- 👥 `@username đã theo dõi bạn`

## Todo
- [ ] Tạo `FeedModule` + `GET /api/feed` endpoint
- [ ] Hoàn thiện `NotificationsModule` (DB save + SSE stream)
- [ ] Frontend: `/feed` page
- [ ] Frontend: `useNotifications` hook với SSE
- [ ] Frontend: `NotificationBell` trong layout header
- [ ] Test: follow user → đăng post → user kia thấy trong feed
- [ ] Test: like post → owner nhận notification qua SSE

## Success Criteria
- Feed hiển thị đúng posts từ followed users, sort by mới nhất
- SSE notification hiện ngay khi có like/comment/follow mới
- Unread count badge cập nhật real-time
- Mark all read hoạt động
