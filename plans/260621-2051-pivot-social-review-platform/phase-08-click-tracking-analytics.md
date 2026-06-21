# Phase 08: Click Tracking & Analytics Dashboard

**Links:** [Plan Overview](plan.md) | [Phase 07](phase-07-feed-notifications.md)  
**Depends on:** Phase 07

## Overview
- **Priority:** Medium
- **Status:** Pending
- **Effort:** ~0.5 ngày

Track clicks vào affiliate links, hiển thị stats cho từng user trên dashboard.

## Affiliate Click Flow

```
Visitor thấy post → click "Mua ngay" button
  ↓
Frontend redirect: GET /r/[postId]
  ↓
Backend: log click → increment counter → 302 redirect → affiliateUrl
  ↓
User xem /dashboard: total clicks, per-post breakdown
```

**Dedup logic:** Không log click từ cùng IP trong vòng 1 giờ cho cùng 1 post (chống inflate giả).

## Backend: Click Tracking

### Endpoint (trong PostsModule hoặc riêng TrackerModule)
```typescript
// GET /r/:postId  (không có /api prefix — cần mount riêng)
@Get('/r/:postId')
async trackAndRedirect(
  @Param('postId') postId: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const post = await this.postsService.findOne(+postId);
  
  // Dedup: check click từ IP này trong 1h qua
  const recentClick = await this.prisma.clickLog.findFirst({
    where: {
      postId: +postId,
      ip: req.ip,
      createdAt: { gte: new Date(Date.now() - 3600000) }
    }
  });

  if (!recentClick) {
    // Log + increment trong transaction
    await this.prisma.$transaction([
      this.prisma.clickLog.create({
        data: {
          postId: +postId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          referer: req.headers['referer'],
        }
      }),
      this.prisma.post.update({
        where: { id: +postId },
        data: { clickCount: { increment: 1 } }
      }),
      this.prisma.user.update({
        where: { id: post.userId },
        data: { totalClicks: { increment: 1 } }
      }),
    ]);
  }

  return res.redirect(302, post.affiliateUrl);
}
```

**Mount:** Route `/r/:postId` mount ở `main.ts` level hoặc dùng `@Controller('r')` không có global `/api` prefix. Cần exclude khỏi global prefix trong `main.ts`:
```typescript
app.setGlobalPrefix('api', { exclude: [{ path: 'r/:postId', method: RequestMethod.GET }] });
```

## Backend: Analytics Endpoints (trong UsersModule/StatsModule)
```
GET /api/users/me/stats              → tổng overview
GET /api/users/me/posts/stats        → stats per post (clicks, likes, comments)
GET /api/users/me/clicks/chart       → click data 7/30 ngày (grouped by day)
```

**clicks/chart response:**
```typescript
{
  period: '7d',
  data: [
    { date: '2026-06-15', clicks: 12 },
    { date: '2026-06-16', clicks: 8 },
    ...
  ],
  total: 45
}
```

SQL query cho chart (PostgreSQL):
```sql
SELECT DATE(created_at) as date, COUNT(*) as clicks
FROM click_logs
WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date ASC;
```

## Frontend: Dashboard Page

### File to Create
```
apps/frontend/src/app/dashboard/page.tsx   (protected)
apps/frontend/src/components/
├── stats-overview-card.tsx   (total posts, total clicks, followers)
├── click-chart.tsx           (line chart — dùng recharts hoặc CSS chart đơn giản)
└── post-stats-table.tsx      (table: title, clicks, likes, comments per post)
```

**Dashboard layout:**
```
/dashboard
┌──────────────────────────────────────┐
│  📊 Tổng quan                        │
│  [X Bài đăng] [Y Clicks] [Z Follows] │
├──────────────────────────────────────┤
│  📈 Clicks 7 ngày qua                │
│  [Line chart or bar chart]           │
├──────────────────────────────────────┤
│  📝 Thống kê theo bài                │
│  Title | Clicks | Likes | Comments   │
│  ...                                 │
└──────────────────────────────────────┘
```

**Chart library:** Dùng `recharts` (nhẹ, React-friendly) hoặc đơn giản hơn dùng CSS bars thuần.

## Environment Note
Thêm affiliate ID của user vào profile:
```
users table: thêm column `affiliate_id VARCHAR(100)` (optional)
```
Khi user set affiliate ID → backend tự append vào affiliate URL khi scrape.

## Todo
- [ ] Implement `GET /r/:postId` với dedup logic
- [ ] Mount route ngoài `/api` prefix
- [ ] Implement analytics endpoints (`/users/me/stats`, `/posts/stats`, `/clicks/chart`)
- [ ] Frontend: `/dashboard` page
- [ ] Frontend: `StatsOverviewCard`, `ClickChart`, `PostStatsTable`
- [ ] Install `recharts` (nếu dùng chart library)
- [ ] Test: click link → log trong DB → count tăng → dashboard hiển thị đúng

## Success Criteria
- Click "Mua ngay" → redirect đúng affiliate URL trong <100ms
- Dedup: click 2 lần từ cùng IP trong 1h = chỉ count 1
- Dashboard hiển thị đúng stats real-time (refresh)
- Chart hiển thị đúng 7 ngày qua
