# Plan Validation — Adversarial Fact-Check

**Date:** 2026-07-09 | **Method:** opened source for every finding the plan relies on; traced logic. | **Verdict legend:** CONFIRMED / FALSE / OVER-SEVERITY / ALREADY-MITIGATED.

## Critical

**C1 — Unbounded `limit` DoS + `Number(cursor)` NaN → CONFIRMED.**
`social/comments.controller.ts:22-32` (`getComments`) and `:34-47` (`getReplies`) pass raw `limit ? Number(limit) : 20` / `Number(cursor)` — no guard, unauthenticated. `social.service.ts getComments` does `take: limit + 1` with nested `replies` include → heavy scan for large limit. `users.controller.ts:66-79` (`getUserPosts`) same raw pattern, no guard. `Number("abc")`=NaN → `cursor:{id:NaN}` → PG error. Note: `posts` route is NOT affected — `QueryPostsDto` has `@Max(50)`+`@IsInt` (query-posts.dto.ts:12-14) and the plan correctly says so. Fix scope (comments/users) is right.

**C2 — Cursor pagination broken for `likeCount`/`clickCount` → CONFIRMED.**
`posts.service.ts:159-161`: `orderBy = sortBy==='createdAt' ? {id:'desc'} : {[sortBy]:'desc'}` — non-unique tie-break while cursor keys on `id` → skip/dup. `sortBy` restricted to 3 values (`@IsIn`, dto:27), so blast radius = likeCount/clickCount only. NO index on those columns — `schema.prisma` Post has only `@@index([userId])`,`[categoryId]`,`[createdAt desc]` → full sort confirmed.

**C3 — `JWT_SECRET` public fallback → CONFIRMED (deploy-time trap).**
`docker-compose.yml:112,162` `${JWT_SECRET:-change-me-to-a-long-random-string}` on both apps. `frontend/src/middleware.ts:14-17`: `if (!secret) return true` — presence-only. Local `.env` sets a real secret, so not a live breach — the plan labels it correctly.

**C4 — `NEXT_PUBLIC_API_URL` baked localhost → CONFIRMED.**
`Dockerfile:14` `ARG NEXT_PUBLIC_API_URL=http://localhost/api`; `constants.ts:1` fallback `http://localhost:3066/api`, `:3` derives `API_ASSET_ORIGIN` from it. Baked at build. Matches incident.

## High

**H5 — "No global ThrottlerGuard" → CONFIRMED gap, but DESCRIPTION EXAGGERATED (partial FALSE).**
No `APP_GUARD`/`ThrottlerGuard` registered globally (verified `app.module.ts:61` only `ThrottlerModule.forRoot`). BUT the report's claim *"only `share` is limited… auth unthrottled"* is FALSE: `auth.controller.ts` applies `@UseGuards(ThrottlerGuard)` on login/register/forgot/etc (lines 38,49,74,83,100,111); `reports.controller.ts:14` and `posts-me.controller.ts:27,39` throttled; `reactions.controller.ts:49` throttles `share`. Real unthrottled mutating routes: **comments (add/delete), follows (post/delete), bookmarks (put), uploads (post image), reactions PUT** (guard sits on `share` only). Global-guard fix still valid; correct the "share only / auth unthrottled" wording.

**H6 — Throttler in-memory under multi-instance → CONFIRMED.**
`app.module.ts:61` `ThrottlerModule.forRoot([{ttl:60_000,limit:60}])` — no `storage:` option → default in-memory. No Redis storage wired anywhere (grep clean).

**H7 — `cached()` unguarded → 500 on Redis pressure → CONFIRMED.**
`posts.service.ts:136-146`: `await this.cache.get` / `await this.cache.set` with NO try/catch. Cache backed by real Redis (`CacheModule` + `cache-manager-redis-yet`, app.module.ts:71). `docker-compose.yml:31-32` `--maxmemory 512mb --maxmemory-policy noeviction`, shared with BullMQ. On a full-but-alive Redis a cache-miss request hits `cache.set` → OOM reject → propagates → 500 for feed/explore/trending. Nuance: cache *hits* don't 500 (get still works); only miss+set path. Real defect, fix (try/catch degrade) correct.

**H8 — `?search=` ILIKE `contains` → CONFIRMED and REACHABLE.**
`posts.service.ts:152-157` builds `OR [{title contains},{content contains}] mode insensitive`. `findAll` IS live: `posts.controller.ts:31-34` `@Get()` → `findAll(query)`. Not dead code. Seq-scan bypass real.

**H9 — Next `revalidate:30` caches empty → CONFIRMED.**
`api.ts:99,104` list/explore use `revalidate: isServer ? 30 : undefined`; trending `:60`. Time-based server cache stores empty results for 30s. Matches stale-empty incident.

**H10 — `/auth/me` in strict `auth_limit` → CONFIRMED.**
`nginx.conf:40` `zone=auth_limit rate=5r/m`; `app-locations.conf:34-35` applies it to prefix `location /api/auth/` (burst=5), which includes `/api/auth/me`. No more-specific location overrides it. Random-429 self-logout plausible.

## Medium (migration drivers)

**Int4 PKs → CONFIRMED.** `schema.prisma:185` `ClickLog.id Int`, `:202` `Notification.id Int`. Both autoincrement Int4, no inbound FKs. BIGINT migration cheap now.

**Unbounded log tables / PII → CONFIRMED (structurally).** `ClickLog` model present, no TTL/partition. Stores IP/UA/referer (PII) — reasonable retention target. Not deeply audited but claim holds.

**User hard-delete cascade → CONFIRMED.** Cascade chain to `User`: Follow (both sides), Reaction, Bookmark, Comment, ClickLog, Notification (recipient+actor), Post — all `onDelete: Cascade`. Deleting a user mass-cascades. Cited line offsets approximate but the chain is real.

**Trending MV missing `share_count` → CONFIRMED.** MV migration `20260625090918_trending_posts_mv` selects only like/comment/click_count + score (no share). `share_count` column added later in `20260703015955`. No later migration recreates the MV. `queryTrending` `SELECT mv.*` → no share_count → `mapRawPostRow` `Number(row.share_count ?? 0)` (posts.service.ts:91) masks it to 0. Shares also absent from MV scoring. Fully confirmed.

**X-Forwarded-Proto → CONFIRMED behaviorally.** `app-locations.conf:5,26` set `X-Forwarded-Proto $scheme` (nginx's own scheme), not honoring an upstream Traefik-forwarded proto → http behind TLS-terminating proxy. Real.

**Google OAuth missing `state` → CONFIRMED.** `google.strategy.ts` `super({...})` has no `state: true` → login-CSRF surface open.

## Extra items the task flagged

**M1 "blind SSRF via HEAD redirect" → correctly REJECTED (verified).** `common/shopee-url.ts` has no fetch/axios/goto/http request (only a default base string `http://localhost:5166` at :116). Pure parser. Plan's rejection + re-scope to real scraper `page.goto` (Phase 2j) is accurate.

**"notifications.create awaited after commit → 500 after successful write" → CONFIRMED REAL, but NOT in the plan (coverage GAP, not false positive).**
`social.service.ts:67` (follow) and `:401` (comment) `await this.notifications.create(...)` AFTER the counter transaction commits. `notifications.service.ts:157-173` `create()` has no try/catch around `prisma.notification.create` (`pushToStream` is guarded, the DB write is not). If that write throws, the caller returns 500 even though follow/comment already committed. Reaction case (`:190`) is inside the try but rethrows any non-P2002 error → same effect. The consolidated report and plan phases do NOT list a fix for this — recommend adding to Phase 2 (wrap notification side-effects in fire-and-forget like `posts.service.create` already does with `void this.notifications.fanoutNewPost`).

## Summary of corrections needed to the plan
- **H5 description** is exaggerated/partly false ("only share limited, auth unthrottled"). Auth/reactions-share/reports/posts-me ARE throttled. Keep the global-guard fix but correct the unthrottled-route list to: comments, follows, bookmarks, uploads, reaction-PUT.
- **H7** true but note only cache-miss requests 500 under a full-alive Redis (hits are fine) — doesn't change the fix.
- **notifications-after-commit** is a real Medium defect absent from the plan — add it.

## Unresolved questions
1. Is `posts.controller.ts findAll` (GET /posts with `sortBy=likeCount`) actually invoked by the frontend, or only `explore`/`trending`? Affects C2 urgency (defect real either way; live-traffic exposure unknown).
2. click_logs retention window / dedup interaction not verified against the dedup code — Phase 3b should confirm the 1h window claim before choosing partition granularity.

Status: DONE_WITH_CONCERNS
Summary: 18 findings checked — 16 CONFIRMED (all 4 Criticals, H6/H7/H8/H9/H10, Int4 PKs, cascade, MV share_count, XFP, OAuth state, unbounded tables). H5 CONFIRMED as a gap but its description is exaggerated/partly false (auth/reactions-share/reports are throttled). M1 SSRF correctly rejected. One real Medium (notifications.create after commit → 500) is CONFIRMED but MISSING from the plan.
