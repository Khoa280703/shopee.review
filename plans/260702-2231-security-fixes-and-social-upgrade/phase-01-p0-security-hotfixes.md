---
phase: 1
title: P0 Security Hotfixes
status: completed
priority: P1
dependencies: []
effort: 0.5 day
---

# Phase 1: P0 Security Hotfixes

## Overview

Fix 3 critical security/correctness bugs: open redirect via the click tracker, CORS bypass via domain prefix, SSE notifications dead behind nginx. No migrations, no breaking changes — independently deployable.

## Requirements

- Functional: `/r/:postId` redirects to Shopee hosts only; CORS exact-match; SSE realtime works through nginx and auto-reconnects.
- Non-functional: existing posts with valid affiliate URLs keep working; error messages stay Vietnamese (user-facing convention).

## Architecture

### 1a. Open redirect — validate affiliateUrl/productUrl on post create/update

Current state: `CreatePostDto.affiliateUrl` is only `@IsUrl()` (`apps/backend/src/posts/dto/create-post.dto.ts:28`); `/r/:postId` 302-redirects straight to it (`tracker.controller.ts:20`). An attacker creates a post with a phishing URL → `shopee.review/r/123` becomes an open redirect.

Fix at the service layer (not DTO-only, because `UpdatePostDto = PartialType(CreatePostDto)` must go through the same gate):
- Extend `SHOPEE_HOSTS` in `posts.service.ts:34` into a shared constant: `['shopee.vn', 'shopee.com', 'shp.ee', 'shope.ee', 's.shopee.vn']`.
- Reuse `assertShopeeUrl` (posts.service.ts:308) → call it for BOTH `productUrl` and `affiliateUrl` in `create()` and `update()` (when present).

**[RED TEAM — CRITICAL] `s.shopee.vn/an_redir` is itself an open redirector.** `affiliate-link-generator.ts:14` produces `https://s.shopee.vn/an_redir?origin_link=<url>`. Whitelisting host `s.shopee.vn` LAUNDERS an open redirect: `affiliateUrl=https://s.shopee.vn/an_redir?origin_link=https://evil.com` passes host check, then Shopee forwards to evil.com.

**[USER DECISION — 2026-07-02] The redirect MUST keep the user's own `affiliateUrl` (that's how the user earns commission — replacing it with a platform link would steal their revenue).** So we CANNOT swap in a productUrl-derived link. The fix is to keep the user's affiliate URL AND validate its destination:
- Validate `affiliateUrl` host is in the Shopee whitelist (as before), AND
- When the host is a redirector (`s.shopee.vn`, `shope.ee`), parse the embedded `origin_link` (and any nested short-link) and require its final destination host to be a Shopee PRODUCT host (`shopee.vn`/`shopee.com`). Reject if `origin_link` points off-Shopee.
- `productUrl` validated strictly to a product host (never a redirector).
- Tracker still redirects the stored `affiliateUrl` (user keeps commission), but only after this destination check passes.
- Reuse the HEAD-resolve logic already in `shopee-url-parser.ts:20` to follow short-links when validating the destination.

**[RED TEAM — MEDIUM] Tracker increments click BEFORE validating.** `tracker.service.ts:33-54` runs the click-increment transaction then `return affiliateUrl`. Validate host IMMEDIATELY after `findUnique` (before any write), else dirty-URL posts still pump counters then 400.

**[RED TEAM — MEDIUM] Legacy dirty URLs.** For posts already in DB whose `affiliateUrl` fails the new destination check: fall back to redirecting the validated `productUrl` (degraded — user loses commission on that click, but link stays usable) and log a warning so the owner can re-save a valid affiliate link; only hard-400 if BOTH are dirty. Count first (`SELECT count(*) FROM posts WHERE affiliate_url !~* 'shopee'`).

### 1b. CORS exact match + trust proxy

`main.ts:38`: `allowedOrigins.some((o) => origin.startsWith(o))` → `https://shopee.review.evil.com` passes. Change to `allowedOrigins.includes(origin)`. Normalize trailing slash when parsing `FRONTEND_URL`.

**[RED TEAM] Do NOT extract a new `common/allowed-origins.ts` file** — YAGNI. `social.gateway.ts:22` already exact-matches via its array; the bug is one char in `main.ts:38`. Fix in place. Before tightening, verify the real prod origin list (Traefik `DOMAIN` host, scheme, port) so exact-match doesn't reject the legit browser `Origin`.

**[RED TEAM — CRITICAL] Missing `app.set('trust proxy', 1)`.** No `trust proxy` anywhere (`main.ts`). Behind nginx (`8081:80`) + Traefik, `req.ip` = nginx container IP for EVERY request → (a) `TrackerService` dedup (tracker.service.ts:23) collapses all users' clicks into one IP bucket (click stats wrong; Phase 4's composite index optimizes a semantically-broken query); (b) all per-IP throttles (Phase 3 resend, Phase 6 share) collapse to one global bucket → trivial DoS. Add `app.set('trust proxy', 1)` (trust exactly 1 hop = nginx) in `main.ts`. Note: this makes `X-Forwarded-For` authoritative — nginx must overwrite it (it sets `X-Real-IP`/`X-Forwarded-For` in `app-locations.conf:3-4`), so trusting 1 hop is safe; do NOT trust the full chain.

### 1c. SSE through nginx + client reconnect

- Backend: `notifications.controller.ts` `@Sse('stream')` — set `X-Accel-Buffering: no` + `Cache-Control: no-cache` via `@Header()` decorators. This is the PRIMARY fix (nginx honors X-Accel-Buffering).
- Nginx (belt & braces): add a dedicated `location = /api/notifications/stream` with `proxy_buffering off`. **[RED TEAM] nginx selects by LONGEST-PREFIX match, not declaration order** — the more-specific location wins regardless of position; the SSE location must re-declare the proxy headers from `app-locations.conf:1-5` (they don't inherit into a sibling location). Auth cache is already bypassed for cookie'd requests via `$auth_bypass` (nginx.conf:56), so no cache concern.
- Frontend `hooks/use-notifications.ts:40`: remove `onerror = () => close()`. **[RED TEAM] EventSource auto-reconnect only applies to transient network drops, NOT HTTP 401.** After Phase 3/5 (revocation/ban), the stream returns 401 and the browser would hammer it. Distinguish: on 401 (or when auth-context reports session dead) → STOP reconnecting and force re-login; only backoff-retry on transient errors (max 5 attempts, 3s). Close on unmount.

## Related Code Files

- Modify: `apps/backend/src/posts/posts.service.ts` (assertShopeeUrl in create/update, strict productUrl validation, export SHOPEE_HOSTS)
- Modify: `apps/backend/src/tracker/tracker.service.ts` (validate host BEFORE increment; productUrl fallback for dirty legacy affiliateUrl)
- Modify: `apps/backend/src/scraper/affiliate-link-generator.ts` (aware: it emits an_redir redirector — see 1a)
- Modify: `apps/backend/src/main.ts` (CORS exact match in place; `app.set('trust proxy', 1)`)
- Modify: `apps/backend/src/notifications/notifications.controller.ts` (X-Accel-Buffering + Cache-Control headers)
- Modify: `nginx/snippets/app-locations.conf` (dedicated longest-prefix SSE location, re-declaring proxy headers)
- Modify: `apps/frontend/src/hooks/use-notifications.ts` (reconnect logic; stop on 401)
- Create: `apps/backend/test/security-fixes.spec.ts` (unit tests)
- NOTE: no new `common/allowed-origins.ts` (red-team: YAGNI, fix in place)

## Implementation Steps

1. Extract `parseAllowedOrigins()` + `isShopeeHost(url)` into `common/`; update `SHOPEE_HOSTS`.
2. Call validation in `PostsService.create/update` for both `productUrl` + `affiliateUrl`.
3. TrackerService: validate `post.affiliateUrl` host before redirect; foreign host → `BadRequestException`.
4. main.ts: CORS exact match via helper. Gateway uses the same helper.
5. NotificationsController: add `@Header('X-Accel-Buffering', 'no')` + `@Header('Cache-Control', 'no-cache')` on `stream`.
6. Nginx: `/api/notifications/stream` location (buffering off) before `/api/`.
7. Frontend: reconnect logic in use-notifications.
8. Tests: `isShopeeHost` (allow: shopee.vn, s.shopee.vn/abc, shope.ee/x; block: evil.com, shopee.vn.evil.com), CORS origin matcher, create post with dirty affiliateUrl → 400.

## Success Criteria

- [ ] POST /posts with `affiliateUrl: "https://evil.com"` → 400.
- [ ] POST /posts with `affiliateUrl: "https://s.shopee.vn/an_redir?origin_link=https://evil.com"` → 400 (destination off-Shopee blocked).
- [ ] POST /posts with a VALID user affiliate link (`s.shopee.vn/an_redir?origin_link=<shopee product>`) → accepted; `/r/:postId` redirects that exact affiliate URL (user keeps commission).
- [ ] `/r/:postId` for a legacy post with dirty affiliateUrl → redirects validated productUrl (degraded, or 400 only if both dirty); NO click increment before validation.
- [ ] `app.set('trust proxy', 1)` present; behind nginx `req.ip` reflects the real client IP (verify dedup buckets per real IP).
- [ ] Origin `https://shopee.review.evil.com` blocked by CORS; legit prod origin (Traefik host) still works.
- [ ] `curl -N http://localhost:8081/api/notifications/stream` (with cookie) receives events immediately, no delay.
- [ ] Dropped SSE connection → client auto-reconnects on transient error; STOPS on 401.
- [ ] Tests pass, build passes.

## Risk Assessment

- Existing DB posts with non-whitelisted affiliate URLs → "Mua ngay" clicks return 400. Mitigation: count first (`SELECT count(*) FROM posts WHERE affiliate_url !~ 'shopee'`); if >0, log warning + report to user for data cleanup; do NOT auto-mutate data.
- `FRONTEND_URL` supports comma-separated origins — helper must preserve the existing split(',') behavior.
