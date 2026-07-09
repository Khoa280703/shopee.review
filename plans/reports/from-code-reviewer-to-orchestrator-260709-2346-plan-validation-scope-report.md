# Plan Validation — Fix Directions & Scope Audit

Scope: architecture-hardening plan (plan.md + phase-01..04). Advisory only, code verified against source. Solo-dev / self-hosted / KISS-YAGNI lens.

Verdict legend: KEEP | SIMPLIFY | RECONSIDER | MISSING. Over-engineering called out explicitly.

## Locked decisions — no silent reversals found
Relative `/api` (1c), atomic counters kept (Non-Goals), BIGINT not UUID (3a), plan-only status, multi-instance design (2b Redis throttler + already-Redis cache). All honored. Good.

## Phase 1 (P0)

- **1a clamp pagination — KEEP.** Accurate: `QueryPostsDto` already clamps (`@Min(1) @Max(50)`, cursor `@IsInt`) → posts path is NOT vulnerable; only `comments.controller` (`Number(cursor|limit)`) and `users.controller.getUserPosts` use raw `Number()` → NaN cursor = PG 500, unbounded limit = DoS. Central helper is the DRY fix. Ensure it also covers `getReplies` (limit 10) and `getUserPosts`.
- **1b JWT_SECRET fail-closed — KEEP.** Verified: `middleware.ts:14` returns `true` when no secret (fail-open) — real hole. Compose `:?` and fail-closed redirect correct. Caveat: fail-closed means the frontend runtime MUST have `JWT_SECRET` or every protected route redirects to login even for valid users — acceptable, but document it as a required env, not optional.
- **1c relative `/api` — KEEP, but caveat is INSUFFICIENT.** The plan says "verify `pnpm dev` still works or note the caveat." It will **break** `pnpm dev`: no nginx fronts dev, so browser `fetch('/api/...')` hits Next (3000) which has no backend there. Fix must add a `next.config` rewrite (`/api/:path* -> http://localhost:3066/api/:path*`) for dev — this also keeps SSR/browser uniform. Also verify nginx proxies `/socket.io` before switching `socket.ts` to same-origin `io()`; current `socket.ts` uses `NEXT_PUBLIC_API_URL`. `next.config.ts` already conditionally guards `remotePatterns` (only adds uploads pattern when absolute) and hardcodes R2 hosts — so that sub-item is mostly already done; with same-origin `/uploads` no remotePattern is even needed. Dockerfile `ARG NEXT_PUBLIC_API_URL=http://localhost/api` (line 14) is the bug source — dropping it is correct.
- **1d global throttler — KEEP.** Verified: `ThrottlerModule.forRoot` registered but NO `APP_GUARD`; guard only applied per-route (`auth.controller` login/change-password). Global guard fine. Must `@SkipThrottle` `/health` + SSE/socket. In-memory-this-phase → Redis in 2b is the right split.
- **1e feed never-empty — SIMPLIFY / EXPAND (incomplete).** Frontend `no-store` + explicit error state = correct. But the bigger stale-empty source is **backend** `PostsService.cached()` (app.module cache `ttl:60_000`): `findExplore`/`getTrending` cache empty results for 60s. The plan's "never cache empty for dynamic feeds" guard is listed only under frontend files — it MUST also live in the backend `cached()` helper (skip `cache.set` when `result.data` is empty). Without that, frontend no-store still gets a 60s-empty payload from the API.
- **1f `/auth/me` out of strict zone — KEEP.** Verified: `location /api/auth/` (burst=5) catches `/api/auth/me`. Add a more-specific `location = /api/auth/me` (or `/api/auth/me`) block above it. Accurate.

## Phase 2 (P1)

- **2a cursor pagination — KEEP, but pick ONE approach.** Verified real bug: `orderBy = {[sortBy]:'desc'}` on non-unique `likeCount`/`clickCount` + Prisma `cursor:{id}` → skip/dupe. The plan lists 3 options; that ambiguity is itself risk. Decide now: compound `orderBy: [{[sortBy]:'desc'},{id:'desc'}]` + composite index + **raw keyset** `WHERE (sortVal,id) < (?,?)` (Prisma `cursor` can't express a non-unique tuple). Not over-engineering — it is the actual Critical fix. Encode cursor as `sortVal_id`.
- **2b Redis throttler storage — KEEP.** Matches locked multi-instance decision; keyed off existing `REDIS_URL`; in-memory fallback for host dev documented. Correct.
- **2c cache fail-safe — SPLIT verdict.** try/catch → DB fallthrough = **KEEP** (cheap, correct, prevents 500). **Second Redis for cache = RECONSIDER — over-engineering.** Cache already runs on the single Redis with a bounded `ttl:60_000` on every key (redisStore + per-call TTL); only the 24h scrape-result cache is long-lived and it is naturally bounded by product count. TTL discipline the plan asks for **already exists**. Adding a second container for `allkeys-lru` is infra scope-creep against KISS at this scale. Verdict: option (ii) — single Redis, keep bounded TTLs (already true), add a memory-usage alert. Defer a second Redis until monitoring shows queue-vs-cache contention.
- **2d unify search — KEEP.** ILIKE `contains` OR-branch confirmed (seq scan, bypasses Meili+FTS). Routing through search service removes a parallel path (DRY). Snapshot ordering before/after as the plan notes.
- **2e tag revalidation — KEEP.** Correct complement to 1e (dynamic=no-store, stable=tagged).
- **2f verified-email gate — KEEP.** Single `@RequireVerifiedEmail` guard reused across mutating controllers is the DRY approach; one-line move to "post-only" if user lowers friction. Matches locked recommendation.
- **2g OAuth `state` — RECONSIDER (feasibility gap).** Verified: backend has **no** `express-session`/session middleware. `passport-google-oauth20` `state: true` requires a session store to persist/verify state — enabling it alone will throw at runtime. Fix must be stateless: signed `state` nonce in a short-lived httpOnly cookie, verified on callback. The plan's "enable `state: true`" is not implementable as written. Flag before impl.
- **2h stop logging verify token — KEEP.** Pino `req.url` redaction of `token` param, keeps GET-link UX. Correct.
- **2i upload throttle + EXIF strip — KEEP.** sharp re-encode strips EXIF + doubles as resize; server-side dimension/byte cap. Right-sized.
- **2j scraper SSRF verify — KEEP.** Correct: it is a *verification* task (confirm `assertShopeeProductUrl` runs before `page.goto`, block private-range/cross-host redirects) not a speculative rewrite. Properly re-scoped from the rejected finding.

## Phase 3 (P2)

- **3a BIGINT PKs — KEEP.** Verified `ClickLog.id`/`Notification.id` are `Int @default(autoincrement())`, no inbound FKs. Cheap now. BIGINT-not-UUID honored.
- **3b partition/retention — KEEP, ORDER HAZARD.** Partitioning `click_logs` needs a table swap (create partitioned + copy + rename). Do the BIGINT `id` (3a) **inside** that same new-table definition — one rewrite, not two heavy rewrites of the same table. Sequence 3a+3b for click_logs as a single migration; keep 3a for `notifications` separate.
- **3c MV recreate w/ share_count — KEEP.** Independent of 3a/3b (MV reads `posts`, not the log tables). Preserve the CONCURRENTLY unique index; schedule refresh immediately after recreate. No conflict with earlier phases.
- **3d User soft-delete — KEEP (gated on GDPR timeline).** Reuse `bannedAt` filter sites as the audit checklist. Right-sized; correctly gated on the open question.
- **3e X-Forwarded-Proto — KEEP.** Real correctness bug (Secure cookies/redirect scheme behind Traefik).
- **3f CI image-build gate — KEEP.** Asserts 1c stays fixed; correctly ordered after 1c.
- **3g reaction optimistic guard — KEEP.** Real client race; pending-guard + stale-response drop is the minimal fix.

## Phase 4 (P3) — deferral discipline is correct

- **4a session/refresh overhaul — KEEP as deferred.** Largest blast radius, feature-flagged, gated on approval. Not scope creep — it is explicitly P3 and independent.
- **4d fanout-on-write — KEEP as deferred.** Correctly gated on a p95 feed-latency metric, hybrid (active-only), full-fanout listed as Non-Goal. Good YAGNI discipline — do NOT pull this earlier.
- **4b/4c/4e/4f — KEEP deferred.** All independent, product-priority gated. No premature build.

## MISSING / gaps to add before impl
1. **Backend `cached()` empty-guard** (1e) — currently only frontend addressed; the 60s empty-cache in `findExplore`/`getTrending` is the primary stale-empty source.
2. **`pnpm dev` rewrite** (1c) — relative `/api` breaks dev without a `next.config` rewrite; caveat as written is insufficient.
3. **OAuth stateless-state** (2g) — no session middleware exists; `state:true` is not implementable as written.
4. **Combine 3a+3b for click_logs** — avoid two heavy rewrites.

## Unresolved questions
- Does `pnpm dev` today rely on absolute `NEXT_PUBLIC_API_URL`? (Confirms the 1c rewrite is mandatory, not optional.)
- Is `/socket.io` already proxied by nginx same-origin? (Blocks the `socket.ts` same-origin switch in 1c.)
- Prod instance count still unknown — keeps 2b/2c "precautionary"; the second-Redis (2c) recommendation should stay deferred until that is known.

Status: DONE_WITH_CONCERNS
Summary: Fix directions are largely correct and scope-disciplined, but three items are not implementable/complete as written — 2c's second-Redis is over-engineering (single-Redis TTL discipline already exists), 2g's `state:true` needs session infra the backend lacks, and 1c's relative `/api` will break `pnpm dev` and misses the backend empty-cache source behind 1e.
