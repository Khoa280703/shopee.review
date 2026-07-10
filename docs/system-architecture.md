# System Architecture

## Overview

shopee.review is a social review platform where users post product reviews with affiliate links and earn commission from clicks. The system is built as a NestJS backend (Node.js) + Next.js 15 frontend, with Prisma + PostgreSQL for persistence, Redis for caching and real-time pub/sub, Meilisearch for search, and Nginx for routing and rate-limiting.

## Service Modules

Backend NestJS modules (`apps/backend/src/app.module.ts`):

| Module | Purpose |
|--------|---------|
| **Auth** | JWT (HttpOnly cookie), email verification (Resend), Google OAuth (Passport), token revocation via User.tokenVersion |
| **Users** | User profiles, follow/unfollow, admin bootstrap on boot (ADMIN_BOOTSTRAP_USERNAME) |
| **Posts** | CRUD operations, product URL scraping, category assignment, denormalized reaction/comment/share counts |
| **Social** | Reactions (renamed from likes; types: LIKE, LOVE, HAHA, WOW, SAD, ANGRY), bookmarks, shares, follow state |
| **Notifications** | Real-time SSE + Socket.io, cursor-paginated, PATCH to mark read, pub/sub via Redis |
| **Feed** | Personal timeline (posts from followed users, excludes blocked/banned), global trending via materialized view (ordered by engagement: reactions + shares + recent comments, weighted by share_count) |
| **Stats** | Click statistics per post, aggregated analytics |
| **Tracker** | Click log recording at `/r/:postId` (dedup 1h/IP), composite index (postId, ip, createdAt) |
| **Search** | Meilisearch primary search + PostgreSQL full-text fallback |
| **Categories** | Post categories (e.g., Electronics, Fashion) |
| **Scraper** | Auto-scrape Shopee product data (API-first, fallback to Playwright), cache 24h, queue-based |
| **Uploads** | Cloudflare R2 S3-compatible image uploads |
| **Metrics** | Prometheus metrics at `/metrics` (restricted to private IPs via Nginx) |
| **Maintenance** | Scheduled tasks (e.g., token version bumps on release, cleanup) |
| **Moderation** | Report + Block models; admin endpoints for reports, post/comment deletion, user ban/unban |
| **Blocks** | Block relationship (User can block another User; blocks cascade: can't comment, react, bookmark, follow; feed excludes blocked; profiles 404 if viewing user blocks you) |
| **Queue** | BullMQ job queues (scrape, email, etc.) with Bull Board dashboard at `/admin/queues` |
| **Redis** | Cache store (TTL 60s default), BullMQ job state, Socket.io adapter, SSE pub/sub |
| **Meilisearch** | Full-text search index (posts by title/content/product) |
| **Prisma** | ORM, database abstraction |

## Data Models

**Core entities** (`packages/database/prisma/schema.prisma`):

- **User**: id, username, email, passwordHash, googleId, displayName, bio, avatarUrl, emailVerified, verifyToken/Exp, resetToken/Exp, **tokenVersion** (bumped on password/ban to revoke old JWTs), affiliateId, totalClicks, followersCount, followingCount, **isAdmin**, **bannedAt**, timestamps
- **Post**: id, userId, title, content, productUrl, affiliateUrl, productMeta (JSON), images[], categoryId, **likeCount** (total reactions), commentCount, clickCount, **shareCount**, timestamps
- **Reaction**: userId (PK), postId (PK), **type** (enum: LIKE, LOVE, HAHA, WOW, SAD, ANGRY), timestamps
- **Bookmark**: userId, postId, timestamps
- **Follow**: followerId, followingId, timestamps
- **Comment**: id, userId, postId, (optional parentCommentId for 1-level replies), content, timestamps
- **ClickLog**: id, postId, ip, userAgent, createdAt; **composite index** (postId, ip, createdAt) for dedup/analytics
- **Notification**: id, recipientId, actorId (who triggered), type (LIKE, COMMENT, FOLLOW, MENTION, NEW_POST), relatedPostId/CommentId, read, timestamps
- **Report**: id, reporterId, targetId, targetType (POST, COMMENT, USER), reason (SPAM, SCAM, OFFENSIVE, FAKE, OTHER), status (PENDING, RESOLVED, DISMISSED), timestamps
- **Block**: blockerId, blockedId, timestamps
- **Category**: id, name, slug, timestamps

## Request/Response Flows

### 1. Post Creation + Scrape Queue

```
User submits POST /api/posts
  ↓
Backend validates product URL
  ↓
Enqueues scrape job (BullMQ → Redis)
  ↓
Scraper worker processes async
  ↓ (API-first, fallback Playwright, 24h cache)
  ↓
Updates Post.productMeta
  ↓
WebSocket/SSE notifies UI of completion
```

### 2. Click Tracking

```
User clicks affiliate link (browser redirect to /r/:postId)
  ↓
Backend records ClickLog (postId, ip, userAgent)
  ↓
Dedup logic: if (postId, ip) exists within 1h, skip
  ↓
Increment Post.clickCount + User.totalClicks (atomic)
  ↓
Redirect to affiliateUrl (Shopee with SHOPEE_AFFILIATE_ID, if present)
```

### 3. Real-Time Notifications

```
User A likes Post (User B authored)
  ↓
Backend creates Notification record
  ↓
Publishes event to Redis pub/sub
  ↓ Parallel:
  ├→ SSE client of User B receives event (if connected to /api/notifications/stream)
  └→ Socket.io client of User B receives event (if connected via socket.io)
  ↓
Frontend updates UI (bell icon, notification list)
  ↓
User can PATCH /api/notifications/:id/read to mark as read
```

### 4. Moderation + Ban

```
Admin POST /admin/reports/:id (approve ban)
  ↓
Backend: User.bannedAt = now(), User.tokenVersion++ (revokes all JWTs)
  ↓ Parallel:
  ├→ HTTP session invalidated (JWT check fails on next request)
  └→ WebSocket session closed (JwtStrategy + WS gateway verify tokenVersion)
  ↓
User profile returns 404 on public GET (if banned)
  ↓
Blocked users excluded from feed queries + can't interact with banned user
```

### 5. Blocking

```
User A PUT /api/users/:usernameb/block (with follow unfollow)
  ↓
Backend creates Block(blockerId=A, blockedId=B)
  ↓
Future interactions:
  ├→ User B cannot comment on User A's posts
  ├→ User B cannot react to User A's posts
  ├→ User A's feed excludes User B's posts
  ├→ User B's profile 404 when viewed by User A (if User A blocks User B)
  └→ User A cannot follow User B
```

### 6. Pagination & Cursor Navigation

```
User requests GET /api/posts?sortBy=likeCount&cursor=abc
  ↓
Backend extracts cursor (previously seen post ID) + limit (1-50)
  ↓
Query uses compound orderBy: [{sortBy}, {id}] + keyset index
  ↓
Returns paginated results + nextCursor (last post ID for next request)
  ↓
Stable sort: identical results regardless of request order (no skip-based pagination)
```

All list endpoints use stable cursor-based pagination (keyset) to prevent duplicates under concurrent writes. Sort is compound: primary key (e.g., createdAt, likeCount) + secondary ID (for tiebreaker).

### 7. Notifications (Best-Effort)

```
User A likes Post (User B authored)
  ↓
Backend atomically updates counters (success)
  ↓ Parallel (non-blocking):
  ├→ Enqueue notification job (fire-and-forget)
  └→ Return 200 OK to User A immediately
  ↓
Notification delivery (async):
  ├→ Create Notification record in DB
  └→ Publish to Redis pub/sub + WebSocket
  ↓
If notification creation fails, parent action (like) already committed
```

Notification creation is **never** blocking. Exceptions during notification emit don't propagate to the client. Ensures user interactions always succeed (like, comment, follow) regardless of downstream notification pipeline health.

## Deployment Topology

```
Internet → Traefik (Coolify, Let's Encrypt TLS) → Nginx:8081
  ↓
Nginx (rate-limit, gzip, microcache, route):
  ├→ /socket.io/* → Backend:3066 (WebSocket, no buffering)
  ├→ /api/notifications/stream → Backend:3066 (SSE, no buffering, 1h timeout)
  ├→ /api/auth/* → Backend:3066 (strict rate-limit)
  ├→ /api/uploads/* → Backend:3066 (upload rate-limit, 12MB body)
  ├→ /api/* → Backend:3066 (general API, 2s microcache for unauthenticated GET)
  ├→ /admin/queues → Backend:3066 (Bull Board, auth in app)
  ├→ /r/:postId → Backend:3066 (click tracking redirect)
  ├→ /metrics → Backend:3066 (restricted to private IPs only)
  ├→ /_next/static/* → Frontend:3000 (long cache, 1y expires)
  └→ /* → Frontend:3000 (Next.js frontend)

Backend:3066 (NestJS):
  ↓
Internal services:
  ├→ PostgreSQL:5432 (via pgBouncer:6432, transaction mode)
  ├→ Redis:6379 (cache, BullMQ, Socket.io adapter, SSE pub/sub)
  ├→ Meilisearch:7700 (search index)
  └→ Cloudflare R2 (image uploads, S3-compatible)

Frontend:3000 (Next.js 15):
  ↓ SSR requests back to Backend:3066 (API_INTERNAL_URL, internal compose network)
```

## Caching Strategy

| Layer | TTL | Invalidation |
|-------|-----|--------------|
| Redis cache | 60s | LRU (in-memory fallback) |
| Nginx microcache (GET /api/*) | 2s | Manual on mutation |
| Nginx static (/_next/static/*) | 60m (cache), 1y (expires) | Immutable hash |
| Product scrape cache | 24h | TTL expiry |
| Meilisearch | On write | Index rebuild |

**Feed cache guarantee:** Feed endpoints (`/explore`, `/trending`, `/me/feed`) never cache empty results. Backend `cached()` helper checks for empty responses before caching; frontend uses `no-store` for feed queries. This prevents serving stale empty feed after new posts are published.

**Cache fail-safe:** Redis errors don't block requests. All cache reads/writes wrapped in try/catch; queries fall back to direct database access on timeout or connection loss.

## Security Posture

### Authentication & Authorization
- **JWT secret required**: `JWT_SECRET` env var is mandatory. docker-compose.yml uses `${JWT_SECRET:?...}`, failing fast if unset (no fallback). Generated via `openssl rand -base64 48`; shared by backend + frontend (Next middleware verifies HS256 tokens).
- **JWT revocation**: tokenVersion claim signed into JWT, checked in strategy + WS gateway; bumped on password change or ban
- **Banned user protocol**: tokenVersion++ kills all active sessions immediately
- **OAuth stateless CSRF**: Google login uses double-submit nonce cookie (signed state cookie matched against ?state param); no express-session required
- **Admin bootstrap**: ADMIN_BOOTSTRAP_USERNAME (comma-separated) idempotent on boot; no self-promotion UI
- **HTTP-only cookies**: JWT stored in Secure flag (HTTPS only if COOKIE_SECURE=true)

### Request Validation & Rate Limiting
- **SmartThrottlerGuard** (global, app-wide):
  - Exempts internal requests (API_INTERNAL_URL SSR → backend) by checking X-Forwarded-For presence
  - No XFF spoofing on shared networks (IPs from untrusted proxies rejected)
  - Nginx per-IP zones enforce limits:
    - General API (`/api/*`): 10/s
    - Auth endpoints (`/api/auth/*`): 5/m
    - Uploads (`/api/uploads/*`): 2/s
    - WebSocket (`/socket.io/*`): 100/s
- **Pagination clamp**: All list endpoints (comments, replies, posts, notifications) parse `limit` + `cursor` with bounds (min=1, max=50)
- **URL validation**: POST/PUT `/api/posts` validates Shopee URL only (no arbitrary affiliates)
- **CORS**: Exact-match origin (no startsWith), credentials enabled

### File Uploads & Media
- **EXIF strip + dimension cap**: Image uploads re-encoded with `sharp` library. EXIF metadata stripped (PII). Dimensions capped: max 3000x3000px (pixel-bomb guard). GIF passthrough without re-encode to preserve animation.

### Scraper & External Requests
- **SSRF guard**: Scraper validates target URL against Shopee host allowlist. All short-link resolution (e.g., bit.ly) uses a timeout (5s) + manual redirect (no automatic fetch). Prevents server-side request forgery to internal/private networks.

### Privacy & Data Retention
- **Nightly retention sweep** (Redis-locked, idempotent):
  - **ClickLog PII purge**: Rows >90 days old deleted (IP + user agent are personally identifiable)
  - **Read notification cleanup**: Read notifications >30 days old marked as deleted
  - Runs via maintenance cron; non-blocking (best-effort)

### Proxy & Protocol Headers
- **X-Forwarded-Proto real**: Nginx maps `X-Forwarded-Proto` to actual scheme (http/https) based on Traefik TLS state. Backend reads correct scheme for redirect URLs, cookie `Secure` flag, OAuth callbacks.
- **Trust proxy**: `['loopback', 'linklocal', 'uniquelocal']` for correct client IP (click dedup, rate-limit)

### Observability & Logging
- **Token redaction**: Single-use tokens (verify, reset, OAuth code) redacted from request-URL logs
- **Metrics endpoint**: `/metrics` (Prometheus) restricted to private IPs via Nginx (127.0.0.1, 172.16.0.0/12, 10.0.0.0/8)

## Observability

- **Logging**: Pino (structured JSON in prod, pretty-printed in dev); /metrics + /health silenced to reduce noise
- **Tracing**: X-Request-ID header (generated per request)
- **Error tracking**: Sentry (backend: SENTRY_DSN, frontend: NEXT_PUBLIC_SENTRY_DSN; no-op if unset)
- **Metrics**: Prometheus at `/metrics` (scrape interval configurable in Grafana)
- **Log aggregation**: Structured JSON + Loki (opt-in in docker-compose.monitoring.yml)

## CI/Build

- **Bundle regression guard**: CI (`build-and-unit` job) asserts the frontend image does NOT bake an absolute API URL into the client bundle. Regression: browser calling `http://localhost/api` (hardcoded in build). Guard greps the compiled JS and fails if port-80 API base is detected. Frontend must use relative `/api` base; one image boots on any host/port.
