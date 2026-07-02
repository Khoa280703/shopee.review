# Phase 1 — Backend P0 Fixes

## Context Links
- `apps/backend/src/posts/posts.service.ts` (getTrending L149-166)
- `apps/backend/src/social/social.service.ts` (follow L18-50)
- `packages/database/prisma/schema.prisma` (Comment L101, Follow L75)
- `apps/backend/src/main.ts` (bootstrap)
- `apps/backend/src/app.module.ts`

## Overview
- **Priority:** P0 (blocking)
- **Status:** completed
- Fix the four blocking issues: in-memory trending sort, follow race condition, missing composite indexes, and stack-trace-leaking errors.

## Key Insights
- `findExplore` is ALREADY SQL-based — do NOT touch it here. Only `getTrending` sorts in JS.
- `getTrending` score formula differs from `findExplore`: trending uses `click*0.4 + like*0.3 + comment*0.3`; explore uses integer weights + recency bonus. Keep trending's existing weights, just move sort to SQL.
- Follow check (`findUnique` L26) runs OUTSIDE `$transaction` (L31). Concurrent requests both pass the check, both insert → unique-constraint error OR double counter increment. Fix: rely on the `@@id([followerId, followingId])` constraint inside the transaction with a guarded create.
- Likes (`likePost` L116) has the same pattern — fix it too for consistency (cheap, same DRY fix).

## Requirements
- Functional: trending returns same ordering, computed in DB. Follow is idempotent under concurrency. Prisma errors return clean JSON (no stack/SQL).
- Non-functional: trending query uses index; no full-table in-memory load.

## Architecture

### 1. SQL trending (`posts.service.ts` getTrending)
Replace `findMany(take:100) + JS sort` with `$queryRaw` ordering by score in SQL, mirroring `findExplore`'s shape so the row→camelCase mapper can be shared. Extract a private `mapRawPostRow()` helper used by both `findExplore` and `getTrending` (DRY). Keep the 7-day window and trending weights.

```
ORDER BY (click_count*0.4 + like_count*0.3 + comment_count*0.3) DESC, id DESC
WHERE created_at >= NOW() - INTERVAL '7 days'
LIMIT <limit>
```

### 2. Follow/Like race (`social.service.ts`)
Move existence handling inside the transaction. Use `create` and catch Prisma `P2002` (unique violation) → treat as already-following (idempotent), skip counter increment. Pattern:

```ts
try {
  await this.prisma.$transaction([
    this.prisma.follow.create({ data: { followerId, followingId: target.id } }),
    // both counter updates
  ]);
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return { following: true };
  }
  throw e;
}
// notification only on real insert
```
Apply the same guard to `likePost`. Drop the pre-transaction `findUnique` existence checks (the constraint is now the source of truth). Keep `unfollow`/`unlikePost` as-is (delete is idempotent enough; optional: catch P2025).

### 3. Indexes (`schema.prisma`)
- `Comment`: add `@@index([postId, parentId])` (keep existing `[postId]`; can drop standalone `[parentId]` since composite covers parentId-with-postId lookups, but KISS — leave `[parentId]` for cascade-delete reply lookups).
- `Follow`: add `@@index([followerId])` (for `listFollowing` which filters by followerId).
- Generate migration: `pnpm --filter @app/database exec prisma migrate dev --name add_follow_comment_indexes`.

### 4. Global Prisma exception filter
Create `apps/backend/src/common/prisma-exception.filter.ts` with `@Catch(Prisma.PrismaClientKnownRequestError)`. Map codes → HTTP:
- `P2002` → 409 Conflict ("Dữ liệu đã tồn tại")
- `P2025` → 404 ("Không tìm thấy")
- default → 400 ("Yêu cầu không hợp lệ")
Return `{ statusCode, message }` only — never `error.meta`/stack. Register globally in `main.ts` via `app.useGlobalFilters(new PrismaExceptionFilter())`. Log full error server-side via Nest `Logger`.

## Related Code Files
- Modify: `apps/backend/src/posts/posts.service.ts`
- Modify: `apps/backend/src/social/social.service.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `apps/backend/src/main.ts`
- Create: `apps/backend/src/common/prisma-exception.filter.ts`
- Create: migration under `packages/database/prisma/migrations/`

## Implementation Steps
1. Add indexes to schema; run `prisma migrate dev`; regenerate client.
2. Refactor `getTrending` to `$queryRaw`; extract shared `mapRawPostRow` helper; reuse in `findExplore`.
3. Rewrite `follow` + `likePost` with in-transaction create + P2002 guard; remove pre-checks.
4. Create + register Prisma exception filter.
5. `pnpm --filter @app/backend build`.

## Todo List
- [ ] Schema indexes + migration
- [ ] SQL getTrending + shared mapper
- [ ] Follow race fix
- [ ] Like race fix (consistency)
- [ ] Prisma exception filter + register
- [ ] Compile check passes

## Success Criteria
- `getTrending` issues one `$queryRaw`, no `take:100`.
- Concurrent follow (simulate with 2 parallel calls) → exactly 1 Follow row, `followersCount=1`.
- Triggering P2002 returns 409 JSON without stack trace.
- `EXPLAIN` on `listFollowing` query shows index scan on `follows_follower_id_idx`.

## Risk Assessment
- Migration on prod data: indexes are additive, safe. Run during low traffic.
- `$queryRaw` score formula drift: assert ordering matches old JS output via a quick manual check on seed data.
- Removing pre-check changes notification timing: ensure notification fires ONLY when create succeeds (inside try, after transaction).

## Security Considerations
- Filter must not leak `meta` (can contain column/constraint names). Whitelist message strings only.

## Next Steps
- Phase 3 builds on the composite Comment index.
- Phase 4 wraps getTrending in cache.
