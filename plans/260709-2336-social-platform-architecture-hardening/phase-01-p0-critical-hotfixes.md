---
phase: 1
title: P0 Critical Hotfixes
status: completed
priority: P0
dependencies: []
effort: 0.5 day
---

# Phase 1: P0 Critical Hotfixes

## Implementation Log (2026-07-10)

All 6 items (1a–1f) implemented. Verified: backend 60 tests pass (new
`parse-page-params` + throttler-exemption tests), backend+frontend typecheck
clean, `pnpm build` 3/3.

Post-implementation `code-reviewer` found 1 Critical (fixed) + follow-ups:
- **C1 (fixed):** the global `ThrottlerGuard` throttled internal SSR traffic —
  SSR calls `backend:3066` directly (no nginx, no `X-Forwarded-For`), so all SSR
  requests shared one container-IP bucket → 429 site-wide under light load. Fix:
  `common/smart-throttler.guard.ts` (`SmartThrottlerGuard`) exempts no-XFF
  internal requests; backend port is not host-exposed so no-XFF ⇒ trusted.
- **H1 (fixed):** global limit raised 60→300 per 60s (browsing session:
  load-more + reactions + comments + unread poll) to avoid false 429s; nginx
  `api_limit` remains the primary external limiter; strict per-route auth limits
  unchanged.
- **M1 (fixed):** socket.io `transports` now `['websocket','polling']` so realtime
  survives the Next dev rewrite / WS-less proxies.
- **H2 (DEPLOY-VERIFY caveat, not fixed):** with `API_ASSET_ORIGIN=''`, LOCAL
  `/uploads/*` images become relative → Next `<Image>` optimizer hairpin-fetches
  them via the request host. Prod uses R2 (absolute URLs) so this is unaffected;
  only bites a no-R2 deployment. Verify avatar/post images render on the real
  deploy host, or add an image loader/`unoptimized` for `/uploads` if R2 is off.
- **M2:** OG/canonical URLs rely on `metadataBase=SITE_URL` (`NEXT_PUBLIC_SITE_URL`)
  to stay absolute — ensure it's set correctly per environment.

## Overview

Six cheap, high-value fixes. No schema change. Each independently shippable. Closes 3 of 4 verified Criticals + 2 High that already caused incidents.

## Requirements

- Functional: no behavior change for legitimate clients; abusive/edge inputs rejected or clamped.
- Non-functional: deploy fails closed on missing secret; one image runs any env.

## Items

### 1a. Clamp pagination bounds (Critical #1 — unauth DoS)
- `social/comments.controller.ts:30,45`, `users.controller.ts:76`: raw `Number(limit)` → `take: limit+1` with nested includes. And `Number(cursor)` → `NaN` → PG 500.
- Fix: central helper `parsePageParams(limitRaw, cursorRaw, {def, max})` → clamp `limit` to `[1, 50]`, coerce cursor to positive int or `undefined` (reject NaN). Apply in `getComments`, `getReplies`, `findAll`, and any `Number(query)` pagination.
- Prefer DTO with `@IsInt @Min @Max @Type` where a DTO already exists (posts uses `QueryPostsDto` — verify it clamps; comments/users use raw `@Query` — convert or use the helper).

### 1b. JWT_SECRET fail-closed (Critical #3)
- `docker-compose.yml:112,162`: `${JWT_SECRET:-change-me...}` → `${JWT_SECRET:?JWT_SECRET is required}`.
- `frontend/src/middleware.ts:14`: no-secret branch `return true` (presence-only) → fail-closed: if `!secret`, redirect protected routes to login (do not pass). Log a startup warning.
- `.env.example`: keep placeholder but comment "MUST override; compose refuses to boot otherwise."

### 1c. Relative `/api` base (Critical #4 — build-time bake) [validated]
- `frontend/src/lib/constants.ts`: `API_URL` → `'/api'` (relative); `API_ASSET_ORIGIN` derives from relative or a runtime `window.location.origin`. `API_INTERNAL_URL` (SSR) stays absolute `http://backend:3066/api` (server-only, correct).
- `socket.ts:8`: **CONFIRMED still uses `NEXT_PUBLIC_API_URL`** — migrate to same-origin (`io()` default / `window.location.origin`); verify nginx proxies `/socket.io` (WS upgrade).
- **`next.config.ts` dev rewrite (REQUIRED — else `pnpm dev` breaks):** relative `/api` has no nginx in front during `pnpm dev`. Add `rewrites()` mapping `/api/:path*` → `http://localhost:3066/api/:path*` (dev only) so both `pnpm dev` and the composed stack work with the same relative base.
- `next.config.ts:4-17`: `images.remotePatterns` — drive from R2 public host env, not the baked API URL.
- `frontend/Dockerfile:14`: **CONFIRMED bug source** — drop the `NEXT_PUBLIC_API_URL` build-arg default (no longer needed for browser). Keep SSR internal URL as runtime env.
- Result: delete the whole port-mismatch bug class; revert the local `.env` `PUBLIC_API_URL` workaround afterward.

### 1d. Global rate limiting (High #5) [validated: list corrected]
- **Correction:** throttle IS already on auth (login/register/forgot), reports, posts-me, share. Genuinely UNthrottled: **comments, follows, bookmarks, uploads, reaction-PUT**. Those are the spam surface.
- `app.module.ts`: register `{ provide: APP_GUARD, useClass: ThrottlerGuard }` so every route is covered by default. Keep the 60/60s default; keep/add stricter per-route `@Throttle` on `login`, `register`, `forgot-password`, `resend-verification`.
- Storage stays in-memory in THIS phase (single-node ok); Redis storage is Phase 2 §2b (multi-instance).
- Verify no health/metrics/SSE endpoint is broken by the global guard (add `@SkipThrottle` where needed: `/health`, SSE stream).

### 1e. Feed cache never serves empty (High #9 — today's stale-empty) [validated: TWO cache layers]
- **Backend (primary root cause — validated):** `posts/posts.service.ts` `cached()` helper caches `findExplore`/`getTrending` results (incl. EMPTY) for 60s. Add a guard IN `cached()`: do NOT store a result whose `data` array is empty (or skip caching for dynamic feeds). This is the layer that actually served empty today.
- **Frontend:** `frontend/src/lib/api.ts:99-109`: for `explore`/`feed`/list fetches, use `cache: 'no-store'` (drop `revalidate:30`). Keep `revalidate` only for stable resources (categories) via tags (Phase 2 §2e).
- `frontend/src/app/page.tsx:21-23`: stop swallowing the error silently — log server-side; render explicit error state distinct from empty state so a fetch failure is never indistinguishable from "no posts".

### 1f. Move `/auth/me` out of strict auth zone (High #10)
- `nginx/snippets/app-locations.conf:34`: `/auth/me` currently in `auth_limit` 5r/m → random 429 self-logout. Move `/auth/me` to the general API zone (or its own generous zone, e.g. 60r/m). Keep `login`/`register` in the strict zone.

## Related Code Files

- Modify: `apps/backend/src/social/comments.controller.ts`, `apps/backend/src/users/users.controller.ts`, `apps/backend/src/posts/dto/query-posts.dto.ts` (verify clamps), `apps/backend/src/common/` (new `parse-page-params.ts` helper), `apps/backend/src/app.module.ts`
- Modify: `apps/frontend/src/lib/constants.ts`, `lib/api.ts`, `lib/socket.ts`, `next.config.ts`, `Dockerfile`, `src/middleware.ts`, `src/app/page.tsx`
- Modify: `docker-compose.yml`, `.env.example`, `nginx/snippets/app-locations.conf`

## Tests / Validation

- `limit=1e9` and `limit=abc` and `cursor=abc` → 400/clamped, not 500 or full scan.
- Boot compose with `JWT_SECRET` unset → refuses to start.
- Build ONE frontend image, run behind nginx on an arbitrary port → browser calls succeed (relative `/api`).
- Hammer an unauthenticated mutating endpoint → 429 after limit.
- Seed empty → add data → feed shows data on next request WITHOUT container restart.
- Hard-reload authed pages repeatedly → no 429 on `/auth/me`.

## Risk / Rollback

- Relative `/api` assumes nginx always fronts the app (true in compose + prod). Document that direct-to-Next dev (`pnpm dev`) needs the dev proxy or absolute SSR URL — verify `pnpm dev` path still works or note the caveat.
- Global throttler could throttle SSE/health — mitigate with `@SkipThrottle`; test before ship.
- All changes revertable per-item; no data migration.
