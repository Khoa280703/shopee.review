---
title: "Phase 4 — React Query (TanStack v5) + Infinite Scroll"
phase: 4
group: C
priority: P2
status: completed
effort: 12h
depends_on: []
blocks: []
created: 2026-06-25
---

# Phase 4 — React Query + Infinite Scroll

## Context Links
- Research: `research/researcher-02-frontend-infra.md` (Section 1: HydrationBoundary, useInfiniteQuery, optimistic updates, staleTime)
- Scout: `lib/api.ts` fetch client (no React Query), `load-more-posts.tsx` manual "xem thêm" button.

## Overview
- **Priority:** P2 (independent — run parallel to backend work)
- **Status:** completed
- Introduce TanStack Query v5: cursor-based infinite feed with IntersectionObserver auto-load, optimistic like/follow/comment with rollback, SSR prefetch via HydrationBoundary.

## Key Insights
- `staleTime` MUST be set: feed `60_000`, post detail `300_000` (default 0 = always refetch, defeats purpose).
- Single `use client` boundary for the feed container; leaf PostCard stays a server/presentational component receiving props.
- Optimistic: cache-based with `onMutate` snapshot + `onError` rollback for like/follow/comment.
- Keep existing `lib/api.ts` as the fetch layer; React Query wraps it (DRY — don't rewrite fetchers).

## Requirements
**Functional**
- Feed loads via `useInfiniteQuery` (cursor pagination), auto-fetches next page when sentinel enters viewport.
- Like/follow/comment buttons update instantly, roll back on error.
- Initial feed page prefetched server-side, hydrated client-side (no waterfall).

**Non-functional**
- `staleTime` per query type as above; `gcTime` feed 5m, detail 15m.
- React Query Devtools enabled in dev only.

## Architecture
```
Server Component (feed page) -> prefetchInfiniteQuery -> dehydrate
  -> <HydrationBoundary state> -> <FeedClient "use client">
FeedClient: useInfiniteQuery(['feed'], fetchPage, getNextPageParam=cursor)
  + IntersectionObserver sentinel -> fetchNextPage()
Buttons: useMutation + onMutate(snapshot+setQueryData) + onError(rollback)
```

## Related Code Files
**Create**
- `apps/frontend/src/lib/query-client.ts` — `makeQueryClient()` with default options (staleTime, gcTime).
- `apps/frontend/src/components/providers/query-provider.tsx` — client provider + Devtools.

**Modify**
- `apps/frontend/src/app/layout.tsx` — wrap with QueryProvider (coordinate with P3 SocketProvider nesting).
- `apps/frontend/src/components/post/load-more-posts.tsx` — replace manual button with IntersectionObserver + useInfiniteQuery.
- `apps/frontend/src/components/social/like-button.tsx` — useMutation optimistic.
- `apps/frontend/src/components/social/follow-button.tsx` — useMutation optimistic.

## Implementation Steps
1. Install: `@tanstack/react-query @tanstack/react-query-devtools`.
2. `query-client.ts`: `defaultOptions.queries = { staleTime: 60_000, gcTime: 300_000, retry: 1 }`. Use stable singleton on client, fresh per request on server.
3. `query-provider.tsx` ("use client"): `QueryClientProvider` + `<ReactQueryDevtools initialIsOpen={false}/>` (dev only).
4. Wrap `layout.tsx`: `<QueryProvider><SocketProvider>{children}</SocketProvider></QueryProvider>`.
5. Convert feed fetch in `lib/api.ts` to a cursor-paginated function returning `{ items, nextCursor }` (reuse existing endpoint; add cursor param).
6. Rewrite `load-more-posts.tsx`:
   - `useInfiniteQuery({ queryKey:['feed', filters], queryFn, initialPageParam, getNextPageParam: last => last.nextCursor })`.
   - `useRef` sentinel + `IntersectionObserver` → `fetchNextPage()` when `hasNextPage && !isFetchingNextPage`.
7. Server prefetch in feed page (server component): `prefetchInfiniteQuery` first page → `dehydrate` → `HydrationBoundary`. Override post-detail query `staleTime:300_000` where used.
8. `like-button.tsx`: `useMutation({ mutationFn:likeApi, onMutate: snapshot+setQueryData(toggle count), onError: rollback, onSettled: invalidate })`.
9. `follow-button.tsx`: same pattern for follow state.
10. Comment submit (in comments-section, coordinated with P3): optimistic insert via mutation; socket echo deduped by id.
11. Test: scroll loads pages automatically; like/follow instant + rolls back on forced error.

## Todo List
- [ ] Install TanStack Query v5 + devtools
- [ ] query-client.ts defaults (staleTime set)
- [ ] query-provider.tsx
- [ ] layout.tsx provider wrap (nest with SocketProvider)
- [ ] cursor pagination fetcher in lib/api.ts
- [ ] load-more-posts.tsx infinite scroll
- [ ] SSR prefetch + HydrationBoundary feed
- [ ] like-button optimistic
- [ ] follow-button optimistic
- [ ] Scroll + optimistic rollback test

## Success Criteria
- Feed auto-loads on scroll (no button).
- Like/follow reflect instantly, revert on simulated failure.
- First feed page server-rendered (no loading flash, no double fetch).
- Devtools show correct staleTime, no over-refetching.

## Risk Assessment
- **layout.tsx shared with P3** → agree nesting order; both edit same file, sequence.
- **staleTime omission** → enforce defaults in query-client.ts so callers inherit.
- **SSR/CSR query key mismatch** → identical queryKey + queryFn shape server and client.

## Security Considerations
- Auth token forwarded via existing `lib/api.ts` (no change to auth model).
- Devtools disabled in production build.

## Next Steps
- Independent; no downstream phase depends on this.
