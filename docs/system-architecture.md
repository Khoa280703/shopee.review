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
| **Feed** | Personal timeline (posts from followed users, excludes blocked/banned), global trending |
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

## Security Posture

- **Open-redirect fix**: POST/PUT `/api/posts` validates Shopee URL only (no arbitrary affiliates)
- **CORS**: Exact-match origin (no startsWith), credentials enabled
- **Trust proxy**: `['loopback', 'linklocal', 'uniquelocal']` for correct client IP (click dedup, rate-limit)
- **JWT revocation**: tokenVersion claim signed into JWT, checked in strategy + WS gateway; bumped on password change or ban
- **Admin bootstrap**: ADMIN_BOOTSTRAP_USERNAME (comma-separated) idempotent on boot; no self-promotion UI
- **HTTP-only cookies**: JWT stored in Secure flag (HTTPS only if COOKIE_SECURE=true)
- **Banned user protocol**: tokenVersion++ kills all active sessions immediately
- **Metrics endpoint**: `/metrics` (Prometheus) restricted to private IPs via Nginx
- **Rate-limiting zones** (Nginx):
  - General API: 10/s
  - Auth endpoints: 5/m
  - Uploads: 2/s
  - WebSocket: 100/s

## Observability

- **Logging**: Pino (structured JSON in prod, pretty-printed in dev); /metrics + /health silenced to reduce noise
- **Tracing**: X-Request-ID header (generated per request)
- **Error tracking**: Sentry (backend: SENTRY_DSN, frontend: NEXT_PUBLIC_SENTRY_DSN; no-op if unset)
- **Metrics**: Prometheus at `/metrics` (scrape interval configurable in Grafana)
- **Log aggregation**: Structured JSON + Loki (opt-in in docker-compose.monitoring.yml)
