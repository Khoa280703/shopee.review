# Phase 3 — Backend Comment N+1 + Reply Pagination

## Context Links
- `apps/backend/src/social/social.service.ts` (getComments L175-195)
- `apps/backend/src/components/social/comments-section.tsx` (frontend consumer)
- Depends on Phase 1 composite index `Comment[postId, parentId]`

## Overview
- **Priority:** P1
- **Status:** completed
- `getComments` includes `replies` with NO `take` limit → a parent with 10k replies loads all 10k per page of 20 parents. Add bounded `take: 10` on replies + a `replyCount` so the UI can show "view more replies".

## Key Insights
- Current query is technically ONE query (Prisma batches the `replies` include), so it's not a classic N+1 round-trip — it's an **unbounded fan-out**: payload size explodes with reply count. The fix is bounding, not query restructuring.
- Frontend `comments-section.tsx` renders `comment.replies?.map(...)` flat with no pagination UI. Adding `take:10` means deep threads silently truncate — must expose `replyCount` and (optionally) a "load more replies" endpoint, else replies vanish from UI.
- KISS: ship bounded replies + `replyCount` now. A dedicated `getReplies(parentId, cursor)` endpoint is a small follow-up; include it since "view more" is a real need (not YAGNI — threads will exceed 10).

## Requirements
- Functional: top-level comments paginated (already are, cursor-based). Each returns first 10 replies + total `replyCount`. New endpoint fetches further replies by cursor.
- Non-functional: bounded payload; reply query hits `Comment[postId, parentId]` index.

## Architecture

### getComments change
```ts
replies: {
  take: 10,
  orderBy: { id: 'asc' },
  include: { user: { select: {...} } },
},
_count: { select: { replies: true } },  // -> replyCount
```
Map `_count.replies` → `replyCount` on each comment in the response (or expose `_count` directly; pick whatever matches existing `Comment` type — check `apps/frontend/src/types`).

### New endpoint: GET replies
- Controller: `GET /api/posts/:postId/comments/:parentId/replies?cursor=&limit=`
- Service `getReplies(postId, parentId, cursor, limit=10)`: `findMany({ where: { postId, parentId }, take: limit+1, cursor logic, orderBy: { id: 'asc' } })` → `{ data, nextCursor }`. Uses composite index.

### Frontend (small)
- `comments-section.tsx`: when `replyCount > shownReplies.length`, render "Xem thêm N trả lời" button calling `socialApi.replies(postId, parentId, cursor)`; append results.
- Add `socialApi.replies()` to `apps/frontend/src/lib/api`.

## Related Code Files
- Modify: `apps/backend/src/social/social.service.ts` (getComments + add getReplies)
- Modify: `apps/backend/src/social/social.controller.ts` (new route)
- Modify: `apps/frontend/src/lib/api` (replies fetch)
- Modify: `apps/frontend/src/components/social/comments-section.tsx` (load-more UI)
- Modify: `apps/frontend/src/types` (add replyCount to Comment)

## Implementation Steps
1. Add `take:10` + `_count` to getComments; map replyCount.
2. Add `getReplies` service method + controller route.
3. Add `socialApi.replies` client + types.
4. Add "Xem thêm trả lời" UI in comments-section.
5. Compile both: `pnpm --filter @app/backend build && pnpm --filter frontend build`.

## Todo List
- [ ] Bound replies take:10 + replyCount
- [ ] getReplies service + controller route
- [ ] Frontend api.replies + types
- [ ] Load-more replies UI
- [ ] Both builds pass

## Success Criteria
- A post with 50 replies on one comment returns only 10 replies + `replyCount:50` in the initial payload.
- "Xem thêm" fetches next 10 via cursor, appends without dupes.
- Reply query `EXPLAIN` shows composite index scan.

## Risk Assessment
- Forgetting frontend → replies beyond 10 silently disappear. Frontend load-more is REQUIRED, not optional.
- `_count` adds a subquery — negligible vs. unbounded include.

## Security Considerations
- Validate `parentId` belongs to `postId` (reuse the check from `addComment`) to prevent cross-post enumeration.

## Next Steps
- After Phase 1 (index). Composes with Phase 5 (polling re-fetches getComments).
