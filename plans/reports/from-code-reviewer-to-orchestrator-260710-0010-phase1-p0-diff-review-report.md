# Phase 1 P0 Hardening — Working-Tree Diff Review

Scope: 17 files (seed.ts ignored per instructions). Baseline green. Review of the uncommitted diff for `plans/260709-2336-social-platform-architecture-hardening` Phase 1.

## Verdict
The individual fixes are mostly correct, but the global `ThrottlerGuard` interacts badly with the SSR-direct-to-backend fetch path and will 429 server-rendered pages sitewide. One CRITICAL blocker + image-optimizer and dev-websocket risks.

---

## CRITICAL

### C1 — Global ThrottlerGuard collapses ALL SSR into one shared per-IP bucket
- Evidence: `app.module.ts:108` binds `ThrottlerGuard` globally at `{ttl:60_000, limit:60}` (`:61`). Default tracker = `req.ip`.
- SSR path: `apps/frontend/src/lib/api.ts:16-17,27` → `baseUrl(isServer)=API_INTERNAL_URL` = `http://backend:3066/api` (compose `docker-compose.yml` frontend env), i.e. frontend container fetches backend **directly, bypassing nginx**. No `X-Forwarded-For` is added, so `req.ip` (Express `trust proxy` = loopback/linklocal/uniquelocal, `main.ts:24`) resolves to the **single frontend-container IP** for every user's SSR call.
- Effect: home (`page.tsx`: explore+categories+trending ≈3 calls), profile, and post-detail (`[username]/[postId]/page.tsx`: get + generateMetadata get + trending ≈3 calls) are all server components. ~20 page renders/min sitewide → `429`, homepage/post pages fail to render for everyone. **Made worse** by C-context change 1e: `api.ts` now forces `cache:'no-store'` on server for `list`/`explore`, removing the 30s SSR data-cache that previously absorbed most SSR hits.
- Client-side calls (through nginx, correct XFF) get proper per-user buckets — only SSR collapses. Note: nginx inherits `proxy_set_header X-Forwarded-For` into the un-redeclared `/api/` locations, so real-client keying is fine there.
- Fix direction: exempt internal SSR traffic — e.g. `@SkipThrottle` is wrong scope; instead skip when the request originates from the internal backend network / a trusted internal header set by SSR, OR track authenticated reads by user id, OR do not globally throttle idempotent GET read routes (throttle mutations only). Whatever the choice, SSR must not share one bucket.

---

## HIGH

### H1 — 60 req / 60s GLOBAL per real user IP is too low for an authenticated session
Even with per-user keying working (client side), one active browsing session (feed load-more + reaction/bookmark taps + comment expand + `notifications/unread-count` polling + categories) easily exceeds 60/min → spurious 429s read as breakage. Recommend per-route tiers: strict on mutations/upload/auth, generous on read GETs; or raise the default well above a single page's fan-out.

### H2 — Local `/uploads/*` `<Image>` optimization now depends on a nginx hairpin the frontend container may not resolve
`constants.ts:10` `API_ASSET_ORIGIN=''` → `resolveAssetUrl('/uploads/x')` returns relative `/uploads/x` (avatar.tsx, image-carousel, post-card, right-sidebar). Next treats leading-`/` as a local image and the optimizer server-side fetches the source from the **request Host** through nginx. Inside the frontend container that host (e.g. `localhost:8081`) is the container itself, not the nginx container → connection refused → `/_next/image` returns 400 → all local avatars/post images blank. R2 absolute URLs are unaffected (returned unchanged). Fix: add an internal `remotePattern` to the backend and keep an absolute optimizer source for `/uploads`, OR a custom `loader`, OR `unoptimized` for these, OR serve uploads from Next `public/`. Verify against the actual deploy host before shipping.

---

## MEDIUM

### M1 — socket.io realtime dead under `pnpm dev` (WS not proxied by Next rewrites)
`socket.ts` now `io()` same-origin with `transports:['websocket']`. `next.config.ts` dev rewrite forwards `/socket.io/:path*` but Next.js rewrites do **not** proxy WebSocket upgrades, and there is no polling fallback. Prod (nginx `/socket.io/` with Upgrade headers) is fine. Acceptance "pnpm dev works via rewrites" holds only for HTTP `/api`,`/uploads`,`/r`; live updates in dev regress vs the old absolute `localhost:3066` connection.

### M2 — OG/canonical image absoluteness now hinges on SITE_URL, not asset origin
`[username]/[postId]/page.tsx:32` OG `images` now emit relative `/uploads/..`; Next resolves them against `metadataBase = new URL(SITE_URL)` (`layout.tsx:15`), so social cards get an absolute URL — OK, and actually better than the old `localhost` origin. But it now depends on `NEXT_PUBLIC_SITE_URL` matching the real serving host; if left at the `https://shopee.review` default on a different host, OG/canonical images point at the wrong origin. Not a new mechanism, but the dependency moved. Confirm SITE_URL is set per-env.

---

## LOW / NOTES
- L1 Two parallel pagination-clamp mechanisms: `posts.controller` uses class-validator DTO (`@Min(1) @Max(50)`), while comments/users/notifications use the new `parse-page-params.ts` helper. Minor DRY inconsistency, not a defect; helper is a clean boundary clamp with good tests.
- L2 `/metrics` (Nest Prometheus controller) and `/r/:id` and google callback are now globally throttled, but scrape/click/login volumes sit well under 60/min. Bull Board (`/admin/queues`) mounts a raw express router (main.ts excludePrefix) → not in the Nest guard pipeline → correctly unaffected. Fine.
- L3 middleware fail-closed reads `process.env.JWT_SECRET` once at module load; compose now injects it into the frontend runtime env, so it will not misfire in real deploys. Good.

---

## Acceptance Criteria
- limit/cursor clamp (comments/replies/user-posts/notifications-list): **MET** — NaN→undefined cursor, limit clamped [1,max], solid unit tests. (notifications clamps cursor only; service controls page size — acceptable.)
- Deploy without JWT_SECRET fails closed (compose + middleware): **MET** (`:?` on backend+frontend; `isValidToken` returns false when no secret).
- Browser API relative / SSR absolute / dev works: **PARTIAL** — HTTP MET; dev WebSocket (M1) AT-RISK.
- Global throttler covers mutations; health+SSE exempt: exemptions **MET**, but SSR read-path collapse (C1) makes the overall change **AT-RISK / blocking**.
- Empty feed not cached (backend) + feed no-store (frontend), non-empty cached: **MET** (`shouldCache` predicate matches both `{data}` and array shapes; only two `cached()` callers, both migrated; no positional-ttl caller broken).
- `/api/auth/me` out of strict zone: **MET** (exact `location =` wins; inherits proxy headers).

## Unresolved Questions
1. Are home/profile/post pages expected to sustain concurrent traffic? If yes, C1 must be fixed before ship (SSR will 429 under trivial load).
2. Does the target deploy serve product/avatar images from local `/uploads` or R2? If local, H2 needs a loader/remotePattern decision.
3. Is realtime expected to work under `pnpm dev`, or is dev realtime acceptable to lose (M1)?

Status: DONE_WITH_CONCERNS
Summary: Pagination, JWT fail-closed, empty-feed caching, and /auth/me zone fixes are correct; but the global 60/60s ThrottlerGuard collapses all SSR (frontend→backend direct, one shared IP bucket) and will 429 server-rendered pages sitewide. Findings: 1 Critical, 2 High, 2 Medium, 3 Low.
