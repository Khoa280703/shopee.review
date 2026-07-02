# Phase 5 — Live Comments Auto-Polling

## Context Links
- `apps/frontend/src/components/social/comments-section.tsx` (client component, useEffect L104)
- `apps/frontend/src/app/[username]/[postId]/page.tsx` (renders CommentsSection)

## Overview
- **Priority:** P2
- **Status:** completed
- Comments are REST-only, loaded once on mount. Add auto-polling every 15-20s to surface new comments without manual refresh. Use Page Visibility API to pause polling when tab hidden (save bandwidth/battery).

## Key Insights
- `CommentsSection` is already a client component with local `comments` state — polling is a localized change, no new infra.
- KISS: polling, NOT websockets/SSE. Audit explicitly asks for polling.
- Merge strategy matters: optimistic local inserts (addTopComment/reply L119, L128) must not be clobbered by a poll. Merge by id — union poll results with local state, dedupe by `comment.id`, preserve locally-added items not yet returned by server.
- Polling must NOT reset scroll or re-trigger loading spinner. Use a silent background refetch (no `setLoading(true)`).
- Replies (Phase 3) complicate merge — poll only refreshes top-level page-1 comments; do not stomp expanded reply lists. Merge replies by id within each parent, keep already-loaded extra replies.

## Requirements
- Functional: new top-level comments from other users appear within ~20s. Local optimistic comments persist. No flicker/scroll jump.
- Non-functional: polling pauses when `document.hidden`; resumes on visibility. Interval cleaned up on unmount.

## Architecture

### Hook: `useCommentPolling`
Extract polling into `apps/frontend/src/components/social/use-comment-polling.ts` (keeps component under 200 lines, reusable):
```ts
useEffect(() => {
  let timer;
  const tick = async () => {
    if (document.hidden) return;
    const page = await socialApi.comments(postId);
    setComments((prev) => mergeById(prev, page.data));
  };
  timer = setInterval(tick, 18_000);
  const onVis = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
}, [postId]);
```

### mergeById helper
- Top-level: build a Map keyed by id from server page; overlay local-only items (ids not in server page, e.g. just-posted) on top, sorted by id desc.
- Per comment: merge replies by id, preferring the longer (more-loaded) reply list to avoid collapsing "view more" results.
- Put `mergeById` in the same hook file or a small `comment-merge.ts` util with a unit-test-friendly pure signature.

## Related Code Files
- Create: `apps/frontend/src/components/social/use-comment-polling.ts`
- (Optional) Create: `apps/frontend/src/components/social/comment-merge.ts`
- Modify: `apps/frontend/src/components/social/comments-section.tsx` (use the hook)

## Implementation Steps
1. Write pure `mergeById(prev, incoming)` (top-level + reply merge, dedupe).
2. Write `useCommentPolling` hook (18s interval + visibility pause).
3. Wire hook into CommentsSection; keep initial load as-is.
4. Verify optimistic add + concurrent poll don't duplicate or drop.
5. `pnpm --filter frontend build`.

## Todo List
- [ ] mergeById pure helper
- [ ] useCommentPolling hook (visibility-aware)
- [ ] Integrate into CommentsSection
- [ ] Verify no flicker / no dup / scroll stable
- [ ] Build passes

## Success Criteria
- Open post in two tabs; comment in tab A appears in tab B within ~20s.
- Switching tab B to background stops network polling (verify Network tab idles).
- Posting locally then a poll fires → no duplicate, no disappearance.

## Risk Assessment
- Merge bug → duplicate keys (React warning) or vanishing optimistic comments. mergeById must be pure + tested.
- Polling storm if many tabs — 18s interval + visibility pause keeps it modest. Backend trending/comments are read-light.
- Interval leak on route change → always clear in cleanup.

## Security Considerations
- Reuses existing public comments endpoint; no auth change. No new attack surface.

## Next Steps
- Best after Phase 3 (so merge handles paginated replies correctly). Otherwise independent.
