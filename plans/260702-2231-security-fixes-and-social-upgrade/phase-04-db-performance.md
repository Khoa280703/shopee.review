---
phase: 4
title: DB & Performance
status: completed
priority: P2
dependencies: []
effort: 0.5 day
---

# Phase 4: DB & Performance

## Overview

Bound the explore query, index the click-dedup lookup, paginate notifications, and add per-notification mark-read. One Prisma migration (index only).

## Requirements

- Functional: explore results unchanged for recent content; notifications page loads incrementally.
- Non-functional: explore query cost independent of total posts table size; dedup lookup stays index-only as click_logs grows.

## Architecture

### 4a. Explore query 30-day window

`posts.service.ts:196` (`queryExplore`) scores ALL posts then sorts — full scan per cache miss (60s TTL per offset). The scoring formula already zeroes recency bonuses after 7 days, so old posts only rank via raw counters. Add `WHERE p.created_at > NOW() - INTERVAL '30 days'` (same window as trending MV) — keeps the "explore" semantic (fresh content) and bounds the scan via the existing `created_at DESC` index. Category filter composes with the window.

### 4b. Click-dedup composite index

`tracker.service.ts:23` dedup query filters `(postId, ip, createdAt >= now-1h)` but only `@@index([postId])` exists — fine at small scale, degrades linearly. Add `@@index([postId, ip, createdAt])` on ClickLog. Keep the existing single-column indexes (createdAt one serves the stats chart).

### 4c. Notifications pagination + single mark-read

`notifications.service.ts:187` `list()` is a fixed `take: 30`. Align with the codebase's cursor pattern (`{ data, nextCursor }`):
- `GET /notifications?cursor=&limit=` → cursor pagination by `id desc` (index `@@index([recipientId, read])` exists; add `orderBy id` uses PK — no new index needed).
- `PATCH /notifications/:id/read` → ownership-checked single mark-read.
- Frontend `use-notifications.ts` + `/notifications/page.tsx`: infinite load-more (match `LoadMorePosts` pattern), clicking a notification marks it read + navigates.
- BREAKING shape change (`AppNotification[]` → `CursorPage<AppNotification>`). **[RED TEAM] `notificationsApi.list` has exactly ONE consumer** — the hook `use-notifications.ts:21` (the `/notifications` page reads via the hook, not the API directly). Three edit points: (a) `api.ts:184` definition, (b) `use-notifications.ts:21` (`.then(setNotifications)` assumes flat array), (c) `notifications/page.tsx:43` (`notifications.filter(...)` assumes array). Update all three in the same commit.

## Related Code Files

- Modify: `packages/database/prisma/schema.prisma` (ClickLog composite index) + migration
- Modify: `apps/backend/src/posts/posts.service.ts` (explore window)
- Modify: `apps/backend/src/notifications/notifications.service.ts` (cursor list, markRead)
- Modify: `apps/backend/src/notifications/notifications.controller.ts` (query params, PATCH :id/read)
- Modify: `apps/frontend/src/lib/api.ts`, `apps/frontend/src/hooks/use-notifications.ts`, `apps/frontend/src/app/notifications/page.tsx`

## Implementation Steps

1. Migration: composite index on click_logs.
2. Explore: add 30-day WHERE to both branches (with/without category); verify EXPLAIN uses `posts_created_at_idx`.
3. Notifications service/controller: cursor pagination + `markRead(userId, id)` with ownership check (404 on foreign id).
4. Frontend: update api types, infinite scroll on notifications page, per-item read on click.
5. Tests: dedup still works (existing tracker behavior), notifications cursor walk, foreign-id markRead → 404.

## Success Criteria

- [ ] `EXPLAIN ANALYZE` explore query shows index range scan on created_at, no full seq scan.
- [ ] `EXPLAIN ANALYZE` dedup lookup uses the composite index.
- [ ] Notifications page loads 30, "load more" fetches next page; single-click marks one read; badge count updates.
- [ ] Old posts (>30d) absent from explore but still reachable via profile/search/direct URL.

## Risk Assessment

- Explore window hides evergreen old posts from the home feed — intended semantic (matches trending), flag in changelog.
- Notification API shape change is internal (frontend is the only consumer) — safe if shipped atomically.
