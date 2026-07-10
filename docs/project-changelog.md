# Project Changelog

## 2026-07-10: Architecture Hardening Phase 1-3 (P0/P1/P2 Defects Closed)

**Consolidated hardening across 3 phases; foundation ready for 100k+ users.**

### Phase 1: P0 Critical Hotfixes
- **Relative `/api` browser base**: No baked `NEXT_PUBLIC_API_URL`. Frontend loads client-side, proxies to `/api` (Nginx same-origin). One image boots on any host/port. `pnpm dev` rewrite handles Next dev proxy.
- **JWT_SECRET mandatory**: `docker-compose.yml` uses `${JWT_SECRET:?...}`, fails fast if unset (was silently signing with public fallback). Generated via `openssl rand -base64 48`; shared by backend + frontend middleware (verifies HS256, fails closed).
- **Global SmartThrottlerGuard**: Exempts internal SSR requests (API_INTERNAL_URL). No XFF spoofing. Nginx per-IP zones: API 10/s, auth 5/m, uploads 2/s, WebSocket 100/s.
- **Pagination clamp**: All list endpoints (comments, replies, posts, notifications) parse `limit` + `cursor` with bounds (min=1, max=50). Prevents unbounded queries.
- **Feed cache never empty**: Backend `cached()` helper checks for empty responses before caching. Frontend uses `no-store` for feed queries. Stale-empty bug fixed.

### Phase 2: P1 Correctness & Resilience
- **Stable cursor pagination**: Compound `orderBy: [{sortBy}, {id}]` with keyset indexes. No skip-based pagination. Prevents duplicates under concurrent writes. Migration added.
- **Cache fail-safe**: All Redis reads/writes wrapped in try/catch. Timeouts/errors fall back to direct DB. No cache outages block requests.
- **SSRF guard (scraper)**: Target URL validated against Shopee host allowlist. Manual redirect for short links (5s timeout). Prevents SSRF attacks.
- **OAuth stateless CSRF**: Double-submit nonce cookie (signed state cookie matched against ?state param). No express-session required.
- **Token redaction**: Single-use tokens (verify, reset, OAuth code) redacted from request-URL logs (not stored in plain text in audit logs).
- **Upload EXIF strip + dimension cap**: Images re-encoded with `sharp`. EXIF metadata stripped (PII). Max 3000x3000px (pixel-bomb guard). GIF passthrough.
- **Notifications fire-and-forget**: Best-effort, never blocking. Exceptions during emit don't propagate to client. Like/comment/follow always succeed.

### Phase 3: P2 Scale Hardening
- **Nightly retention sweep**: Redis-locked, idempotent cron. ClickLog PII (IP/UA) purged >90 days. Read notifications cleaned >30 days. Non-blocking.
- **Trending MV with share_count**: Materialized view recreated to score by reactions + shares + recent comments, weighted by `Post.shareCount`. Live trending now accounts for viral spread.
- **Real X-Forwarded-Proto**: Nginx maps `X-Forwarded-Proto` based on Traefik TLS state. Backend reads correct scheme for redirect URLs, cookie `Secure` flag, OAuth callbacks.
- **CI bake-URL guard**: `build-and-unit` job fails if client bundle bakes absolute API URL (port-80 regression). Guards against hardcoded localhost/API in compiled JS.
- **Optimistic reaction + reconcile**: Rapid-tap race fixed. Client optimistically updates UI; server reconciles on conflict.

### Deferred (Not Done + Rationale)
- **2b Redis throttler storage**: Single-node + Nginx per-IP limits sufficient. Custom ioredis ThrottlerStorage (security-sensitive) deferred until multi-instance.
- **2d search unify (drop ILIKE)**: Changes findAll contract + FE consumer. Meili/FTS primary search already live; secondary ILIKE path can wait for paired FE change.
- **2e tag revalidation**: Feed already no-store. Tag invalidation is optimization, not correctness. Low value; deferred.
- **3a BIGINT PKs + partition**: BIGINT `notification.id`/`click_log.id` → JS `bigint` → `JSON.stringify` throws. Type ripple through code. Int4 exhaustion far off; retention (3b) bounds growth. Do when volume warrants, with serialization handled.
- **3d User soft-delete**: Large refactor touching every User read path. Gated on unresolved GDPR/account-deletion timeline. Implement when real requirement, not speculatively.

**Updated docs:**
- system-architecture.md: SmartThrottlerGuard, pagination clamp, feed cache, SSRF, OAuth nonce, upload guards, notifications, cursor pagination, trending MV, X-Forwarded-Proto, retention, CI guard
- deployment-guide.md: already updated with JWT_SECRET required, relative-/api, API_INTERNAL_URL
- See plans/260709-2336-social-platform-architecture-hardening/ for full phase details + validation log

---

## 2026-07-03: Security, Social, and Moderation (Phases 1-7 Complete)

**Major accomplishments across 6 completed phases:**

### Phase 1: Infrastructure Hardening & Security
- Fixed open-redirect vulnerability: validate Shopee URLs only in product posting (no arbitrary affiliate URLs)
- Implemented CORS exact-match (no startsWith) to prevent subdomain bypasses
- Added `trust proxy` setting for correct client IP through Traefik→Nginx→Backend proxy chain
- Configured Nginx for SSE (`/api/notifications/stream` with `proxy_buffering off`) and WebSocket (`/socket.io/` no buffering)
- Migrated port from 3001 → 3066

### Phase 2: Infrastructure Modernization
- Single Redis instance (512mb, noeviction) replaces separate caches; powers BullMQ job queues and Socket.io adapter
- Introduced pgBouncer connection pooling (transaction mode, 10 default/5 min/100 max client connections)
- Real database health checks (SELECT 1, return 503 on fail) for graceful degradation
- Made SHOPEE_AFFILIATE_ID optional; scraping degrades to plain product URL when unset
- Metrics endpoint (`/metrics`, Prometheus) restricted to private IPs only via Nginx

### Phase 3: Authentication & JWT Revocation
- Implemented JWT revocation via User.tokenVersion: bumped on password change or ban; signed as `ver` claim; checked in JwtStrategy and WS gateway
- One-time global token bump on release (idempotent)
- Added verify-token endpoint with 24h expiry + resend capability
- Implemented POST /auth/change-password
- Fixed FollowButton to fetch real follow state before rendering

### Phase 4: Feed & Notification Optimization
- Bounded explore/trending queries to 30 days (prevent bloat from old posts)
- Added composite index on ClickLog (postId, ip, createdAt) for efficient click dedup (1h/IP) and analytics
- Implemented cursor-based pagination for notifications + PATCH /notifications/:id/read for mark-as-read

### Phase 5: Moderation & Admin System
- Added Report + Block models with proper enums (ReportReason, ReportStatus, ReportTargetType)
- User model: isAdmin boolean + bannedAt timestamp
- Admin endpoints: GET /admin/reports, PATCH /admin/reports/:id (resolve), DELETE /admin/posts/:id, DELETE /admin/comments/:id, POST/DELETE /admin/users/:id/ban, POST/DELETE /admin/users/:id/unban
- Admin bootstrap: ADMIN_BOOTSTRAP_USERNAME env var grants is_admin on boot (idempotent, no self-promotion UI)
- Ban protocol: sets User.bannedAt + bumps tokenVersion (invalidates all JWT + WS sessions immediately)
- Block protocol: User A can block User B; blocked users excluded from Feed, can't comment/react/bookmark/follow; blocked user's profile returns 404 to blocker

### Phase 6: Social Features Expansion
- Reactions table replaces likes: userId (PK) + postId (PK) + type (enum: LIKE, LOVE, HAHA, WOW, SAD, ANGRY)
- Post.likeCount = total reaction count (atomic, all types aggregated)
- Endpoints: PUT /posts/:id/reactions (upsert/toggle), GET /posts/:id/reactions/me
- Bookmark model + PUT /posts/:id/bookmark (upsert/delete) + GET /me/bookmarks + /saved UI page
- Post.shareCount tracking + POST /posts/:id/share endpoint
- Socket event renamed: `like:update` → `reaction:update`

### Phase 7: CI/CD & Observability
- GitHub Actions CI (`.github/workflows/ci.yml`):
  - **build-and-unit**: Type-check (backend + frontend), unit tests (mocked Prisma, no DB), full build
  - **integration-db**: Postgres service, apply migrations, drift-check (catches un-renamed constraints from refactors)
- Structured JSON logging (Pino, redacted auth headers); production-ready format
- Prometheus metrics at `/metrics` (private IPs only via Nginx)
- Sentry integration (backend: SENTRY_DSN, frontend: NEXT_PUBLIC_SENTRY_DSN; no-op when unset)
- Log aggregation ready (Loki/Grafana in docker-compose.monitoring.yml)

**Updated docs:**
- system-architecture.md: full service map + data flows + security posture
- deployment-guide.md: docker-compose stack, env vars, admin bootstrap, R2 setup, health checks
- development-roadmap.md: phases summary + next candidates
- README.md: updated feature list, env vars, realtime tech (SSE + Socket.io)

**Deprecated / removed:**
- ADMIN_PASSWORD env var (replaced by User.isAdmin + ADMIN_BOOTSTRAP_USERNAME)
- UPLOAD_DIR local uploads (all images now go to Cloudflare R2)
- Port 3001 (backend now 3066)
- /admin/deals (app pivoted from deal aggregator to social review platform)

---

## 2026-06-10: MVP Launch

- Implemented shopee.review monorepo (pnpm + Turborepo).
- Built NestJS backend with admin auth (ADMIN_PASSWORD), deals CRUD, categories, local uploads, expiry scheduler, click tracking (/r/:postId).
- Built Next.js frontend with public feed/grid, deal detail pages, admin login/dashboard/deal creation.
- Prisma + PostgreSQL 16 schema and migrations.
- Docker Compose with Postgres service.
- Coolify deployment guide.
- Fixed: root .env loading, public DRAFT leakage, local upload rendering, Postgres array schema, scraper DTO validation.
- Added idempotent sample-data seed (categories, active deals, draft deal, local images).
- Updated public UI: feed layout, grid card stability, button alignment, mobile responsiveness.
- Ported local dev ports: frontend 5166, backend 3066.
- Integrated Stitch design system (UI assets from project 9744743019150831028).

## Unresolved Questions

None at this time.
