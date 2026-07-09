---
phase: 2
title: P1 Correctness & Resilience
status: planned
priority: P1
dependencies: [1]
effort: 1.5 day
---

# Phase 2: P1 Correctness & Resilience

## Overview

Fix the remaining verified Critical (cursor pagination), make the Redis-dependent paths resilient, unify the search path, and close medium security gaps. One migration (index). Designed multi-instance-safe.

## Items

### 2a. Stable cursor pagination (Critical #2 — LATENT, confirmed not frontend-triggered) [validated]
> Urgency note: `sortBy` is not sent by the frontend anywhere — this only breaks via a direct API call `?sortBy=likeCount&cursor=`. Real defect on a public endpoint; fix here, but it is not an active user-facing bug. `?search=` (§2d) is the live path.

- `posts/posts.service.ts:159-161`: `orderBy = sortBy==='createdAt' ? {id:'desc'} : {[sortBy]:'desc'}` — non-unique for `likeCount`/`clickCount`, cursor on `id` → skip/duplicate.
- **CHOSEN approach (one, not options):** compound `orderBy [{ [sortBy]: 'desc' }, { id: 'desc' }]` + **raw keyset tuple** cursor `(sortValue, id)` — because Prisma `cursor:{id}` cannot express a non-unique tuple. Encode cursor as `${sortValue}_${id}`, decode to `WHERE (sortCol, id) < (v, i)`.
- Migration: add `@@index([likeCount, id])` and `@@index([clickCount, id])` (add `(categoryId, likeCount, id)` only if category filter composes with sort). Verify EXPLAIN uses it.
- Test: seed many posts with tied `likeCount`; walk all pages; assert set-equality with a single big query (no gaps/dupes).

### 2b. Redis-backed throttler (High #6)
- Move ThrottlerGuard storage to Redis (`@nest-lab/throttler-storage-redis` or equivalent) keyed off the existing `REDIS_URL`. When `REDIS_URL` unset (host dev) → in-memory fallback (document divergence).
- Ensures login/register limits hold across instances.

### 2c. Cache operations fail-safe (High #7) [validated: second-Redis DROPPED as over-engineering]
- `posts/posts.service.ts:136 cached()`: wrap `cache.get`/`cache.set` in try/catch → on Redis error, fall through to DB (degrade, never 500). Log at warn. **This is the whole fix — KEEP.**
- **Second Redis / separate cache DB: DROPPED.** Validation confirmed cache already sets `ttl:60000` on every key (`app.module.ts:62-77 redisStore ttl:60000`) — the "TTL discipline" is already in place, so cache keys self-expire and don't accumulate against BullMQ state. Adding a second Redis is infra scope-creep, violates KISS at this scale.
- Instead: add a Redis memory-usage **alert** (Prometheus, e.g. warn at 80% of 512MB) so pressure is visible before it bites. Revisit a dedicated cache Redis ONLY if the alert fires repeatedly.

### 2d. Unify search path (High #8)
- `posts/posts.service.ts:152-157`: `?search=` uses ILIKE `contains` (seq scan, bypasses FTS GIN + Meili).
- Fix: route `findAll(search)` through the existing search service (Meili primary, PG FTS fallback). Remove the ILIKE branch. Ensure ranking + pagination consistent with the search controller.

### 2e. Tag-based revalidation for stable resources
- Categories / post-detail: use `next: { tags: [...] }` + `revalidateTag` on mutation instead of time-based `revalidate`. Complements Phase 1e (feed = no-store; stable = tagged).

### 2f. Auth/verify gate policy — DECIDED 2026-07-10 (mostly no-op; already correct)
- **Login gate: ALREADY COMPLETE — no work.** Every write is `JwtAuthGuard`-protected (comment `comments.controller:50`, reaction `:32`, bookmark class-level, follow `follows.controller:11,17`, report/block class-level, create-post `posts-me.controller:22`). Guests can only read. This IS the standard-MXH baseline the user asked for.
- **Email-verify gate: KEEP AS-IS (post-create only).** `posts.service.ts:259` already blocks posting until `emailVerified`. Comment/react/follow require login only.
- **Do NOT add a `@RequireVerifiedEmail` guard on all writes** — validated user decision: standard social networks (FB/Twitter/IG) do NOT hard-block interaction on email-verify; this app already exceeds the norm by gating posting. Adding it = unnecessary friction. DROPPED.
- Anti-bot for unverified/new accounts is handled by the global throttler (Phase 1d) + per-route limits, not by verify-gating interactions.

### 2g. OAuth `state` (Medium — login CSRF) [validated: MUST be stateless]
- `auth/strategies/google.strategy.ts:16`: login CSRF real, BUT **`passport state:true` requires `express-session` which is NOT installed** (validated — would throw at runtime).
- Fix (stateless): generate a signed random nonce, store in a short-lived httpOnly cookie before redirect, pass it as the `state` query param to Google, and verify cookie==callback-state on return. No session store, no new dependency beyond crypto.

### 2h. Stop logging verify token (Medium)
- Verify-email token currently in query string → pino logs `req.url`. Move token to a POST body OR redact `token` query param in the pino serializer. Prefer redaction (keeps GET link UX).

### 2i. Upload throttle + EXIF strip (Medium)
- `uploads/`: add per-user throttle; re-encode images (sharp) to strip EXIF (GPS/PII) and normalize format/size. Doubles as the long-deferred resize optimization (cost + abuse control). Cap dimensions + bytes server-side.

### 2j. Scraper SSRF verification (re-scoped from rejected M1)
- The reviewer's "shopee-url.ts HEAD fetch" claim was FALSE (no fetch there). Real surface: `scraper/shopee-playwright-fallback-scraper.ts:37 page.goto(productUrl)`.
- Task: verify `productUrl` host is asserted Shopee (via `assertShopeeProductUrl`) BEFORE `page.goto`, and that Playwright cannot be redirected to internal hosts (block private-range navigation / disable following cross-host redirects). Add a test with an internal-IP / non-Shopee URL → rejected pre-navigation.

### 2k. Notification write must not fail the parent action [validated — NEW finding]
- `social.service.ts:67` (follow) and `:401` (comment) `await notifications.create(...)` AFTER the transaction commits; `notifications.service.ts:157` has no try/catch around `prisma.notification.create`. If it throws → client gets 500 even though the follow/comment already committed (inconsistent, confusing retries). Reaction path (`:190`) rethrows non-P2002 → same effect.
- Fix: make notification emission fire-and-forget (`void this.notifications.create(...).catch(logWarn)`), matching the pattern `posts.service.create` already uses. The parent write's success must not depend on notification delivery.
- Test: force `notification.create` to throw → follow/comment/react still return success.

## Related Code Files

- Modify: `packages/database/prisma/schema.prisma` + 1 migration (cursor-sort indexes)
- Modify: `apps/backend/src/social/social.service.ts` + `notifications/notifications.service.ts` (fire-and-forget)
- Modify: `apps/backend/src/posts/posts.service.ts`, `search/*`, `app.module.ts` (throttler storage), `auth/strategies/google.strategy.ts`, `uploads/*`, `scraper/shopee-playwright-fallback-scraper.ts`, pino logger config, new `@RequireVerifiedEmail` guard
- Modify: `apps/frontend/src/lib/api.ts` (tags), mutation hooks (revalidateTag)

## Success Criteria

- [ ] Cursor walk under `sortBy=likeCount` returns every row once (test).
- [ ] `EXPLAIN` shows index range scan for sorted+cursor query.
- [ ] Kill Redis mid-request → feed degrades to DB, no 500.
- [ ] `?search=` hits Meili/FTS (EXPLAIN: GIN, not seq scan).
- [ ] Login rate-limit holds across 2 simulated instances.
- [ ] Unverified user blocked from writes with mappable 403 (if gate-all chosen).
- [ ] OAuth callback rejects mismatched `state`.
- [ ] Uploaded JPEG with GPS EXIF → stored file has EXIF stripped.
- [ ] Scraper rejects internal-IP/non-Shopee URL before navigation.

## Risk / Rollback

- Search unification may change result ordering — snapshot before/after, confirm acceptable.
- Second Redis for cache adds a container — justify vs single-Redis TTL discipline; decide in impl, document.
- Cursor keyset change touches the public feed contract — ship frontend + backend together.
