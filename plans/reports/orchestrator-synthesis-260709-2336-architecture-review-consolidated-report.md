# Architecture Review — Consolidated Synthesis

**Date:** 2026-07-09 | **Scope:** full codebase (backend domain, backend security, database, frontend+infra) | **Method:** 4 parallel code-reviewer subagents + orchestrator cross-verification. **Baseline:** 53/53 backend tests pass, typecheck clean both apps.

**Target trajectory:** real social platform, 100k+ users, self-hosted single node now.

## Readiness scores (per reviewer)

| Layer | Score | Verdict |
|---|---|---|
| Database / data model | 7/10 | Solid foundation; 1 correctness bug + operational gaps |
| Backend domain | 6/10 | Right patterns; 1 trivial DoS + Redis/throttle resilience gaps |
| Backend security | 5/10 | 7-phase hardening intact; no Critical, but platform-security features missing |
| Frontend + infra | 5/10 | 2 config/cache architecture faults (both hit us today) + deploy secret trap |
| **Overall** | **~6/10** | Good bones, not yet "chuẩn chỉ" for social scale. All top issues are cheap to fix now. |

## VERIFIED findings (orchestrator read the code — confirmed)

### Critical
1. **Unbounded `limit` → unauth DoS.** `social/comments.controller.ts:30,45` + `social.service.ts:306` pass raw `Number(limit)` to `take: limit+1` with nested `replies` include. `GET /posts/:id/comments?limit=1000000` (no auth) = heavy scan. Same class: `users.controller.ts:76`. Also `Number(cursor)`=`NaN` → PG 500. **Fix:** clamp limit `Math.min(n||20, 50)`, validate cursor int. *(convergent: domain + security reviewers)*
2. **Cursor pagination broken for `sortBy=likeCount|clickCount`.** `posts/posts.service.ts:161` builds non-unique `orderBy` while cursor keys on `id` — no tie-breaker → rows skipped/duplicated across pages; no index on `like_count`/`click_count` → full sort. **Fix:** composite orderBy `[{[sortBy]:desc},{id:desc}]` + matching index, or keyset on the sort column. *(convergent: db + domain reviewers)*
3. **`JWT_SECRET` public fallback in compose.** `docker-compose.yml:112,162` `${JWT_SECRET:-change-me-to-a-long-random-string}` feeds BOTH apps → backend `getOrThrow` never fires; forgetting the env at deploy = whole stack signs/verifies with a repo-public secret → anyone mints valid JWTs. `middleware.ts:14` secret-absent = presence-only (`return true`). *(local `.env` DOES set it — this is a deploy-time trap, not a live breach.)* **Fix:** `${JWT_SECRET:?JWT_SECRET required}` + middleware fail-closed.
4. **`NEXT_PUBLIC_API_URL` baked at build with `http://localhost/api` default.** `frontend/Dockerfile:14` → `constants.ts:1,3`, `socket.ts`, `next.config.ts` remotePatterns. Broke all browser calls today (port 80). **Systemic fix (KISS):** use **relative `/api`** — nginx is same-origin for API/SSE/socket/uploads/`/r/`, so one image runs every env and the whole bug class disappears.

### High
5. **No global ThrottlerGuard.** `app.module.ts:61` configures limits but registers no `APP_GUARD` → only `share` is limited. All mutating endpoints (comment/follow/react/bookmark/upload/auth) unthrottled → spam/brute-force. **Fix:** register `{provide:APP_GUARD,useClass:ThrottlerGuard}` + per-route overrides for login/register/forgot. *(convergent: domain + security)*
6. **Throttler storage in-memory under multi-instance.** limits multiply per instance → weak brute-force protection once scaled behind Traefik. **Fix:** Redis throttler storage.
7. **Cache get/set not wrapped; shared Redis is `noeviction` + BullMQ.** `posts.service.ts` `cached()` (:136) has no try/catch → if Redis fills (queue jobs never evict), feed/explore/trending throw 500 en masse. **Fix:** guard cache ops (degrade to DB on Redis error); separate cache logical DB or eviction policy from queue.
8. **`?search=` uses ILIKE `contains`** (`posts.service.ts:152-157`) — a 3rd search path bypassing both Meilisearch and the FTS GIN index → seq scan. **Fix:** route search through FTS/Meili; drop the ILIKE branch.
9. **Next fetch `revalidate:30` caches empty results** (`api.ts:99-109`) despite `force-dynamic` (route cache ≠ fetch data cache); `page.tsx:21` swallows the error. Root cause of today's stale-empty. **Fix:** `no-store` for feed/explore; tag + `revalidateTag` for post detail/categories; never cache empty.
10. **`/api/auth/me` in `auth_limit` 5r/m zone** (`nginx app-locations.conf:34`) but auth-context calls it every hard load → random 429 "self-logout". **Fix:** move `/auth/me` out of the strict login zone.

### Medium (verified subset)
- **Unbounded-growth tables w/ no retention:** `click_logs` (stores IP/UA/referer = PII) + `notifications` (1 row/follower fanout). **Fix:** TTL/partition + archival. *(db)*
- **Int4 PKs on `click_logs.id`/`notifications.id`** — cheap BIGINT migration now (no inbound FKs), painful at 100M+ rows. Recommend BIGINT (not UUID). *(db)*
- **User hard-delete cascade** (`schema.prisma:108,127,142,172,210`) → blocks safe account-deletion/GDPR; others' counters wrong up to 24h. *(db)*
- **Trending MV missing `share_count`** (MV created before the column migration) → shows 0 AND drops shares from scoring (`posts.service.ts:91` `?? 0` masks it). *(db + domain)*
- **X-Forwarded-Proto forced `http`** behind Traefik + `:8081` publish bypasses TLS. *(infra)*
- **Reaction-button rapid-tap race** — no optimistic guard, out-of-order responses. *(frontend)*
- **CI can't catch the port-80 bake bug** — never builds/boots the docker image. **Fix gate:** build image w/o build-arg + grep bundle for `http://localhost/api` → fail. *(infra)*
- **Google OAuth missing `state`** (`google.strategy.ts:16`) → login CSRF. *(security)*
- **Verify-email token in query string** logged by pino `req.url`. *(security)*
- **Uploads:** no throttle, no re-encode/EXIF strip → GPS/PII leak + R2 cost abuse. *(security)*

## NOT verified / corrected
- **M1 "blind SSRF via HEAD redirect:follow" (security reviewer):** cited `shopee-url-parser.ts:20`, but `common/shopee-url.ts` is a **pure URL parser — no network fetch**. Claim as-described is unconfirmed. Real SSRF surface = scraper `page.goto(productUrl)` (`shopee-playwright-fallback-scraper.ts:37`) — needs its own check that productUrl host is validated pre-visit. Reclassified: **needs verification**, not confirmed.

## What's genuinely GOOD (don't touch)
- Counter math atomic (`increment/decrement`) + P2002/P2025 idempotency — correct pattern; **no sharded counters needed** at this scale.
- Raw SQL fully parameterized — no injection found.
- MV refresh CONCURRENTLY + Redis lock — correct.
- pgBouncer transaction-mode clean (no advisory locks/SET/long tx).
- likes→reactions rename migration complete (PK/FK/index renamed, zero drift).
- Stored-XSS blocked by React auto-escape (only 1 `dangerouslySetInnerHTML`, pre-escaped).
- WS auth parity with tokenVersion/ban; CORS exact-match; open-redirect guard intact.
- fanout processor paginates + skipDuplicates (retry-safe).

## Prioritized remediation order
**P0 (before any growth) — hours, mostly cheap:** #1 limit clamp, #3 JWT fail-fast, #4 relative `/api`, #5 global throttler, #9 no-store feed cache, #10 auth/me zone.
**P1 (before real users):** #2 cursor fix+index, #6 Redis throttler, #7 cache guard, #8 search path, OAuth state, verify-token logging, upload throttle+EXIF.
**P2 (scale hardening):** log-table retention+partition, BIGINT PKs, MV share_count recreate, soft-delete for User, X-Forwarded-Proto, CI image gate, reaction optimistic guard.
**P3 (platform features):** session list/revoke, 2FA, admin audit log, feed fanout-on-write for active users, SEO/OG tags for shared posts.

## Unresolved questions (need user)
1. Prod deploy: how many backend instances behind Traefik? (sizes H6 throttler-storage urgency)
2. Email-verification policy: gate ALL writes or only post-create? (affects spam surface)
3. Backend port 3066 ever exposed outside private net in prod? (affects /metrics app-guard need)
4. Account-deletion / GDPR a near-term requirement? (drives soft-delete priority)
5. Video/clips still on roadmap? (changes upload + storage architecture materially)
