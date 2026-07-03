# Development Roadmap

## Completed Phases

### Phase 1: MVP (completed 2026-06-10)
- Monorepo setup (pnpm + Turborepo)
- NestJS backend with basic CRUD, admin auth, categories, local uploads, expiry scheduler, click tracking
- Next.js frontend with public feed/grid, deal detail, admin panel
- Prisma + PostgreSQL schema and migrations
- Docker setup and Coolify deployment guide

### Phase 2: Infrastructure & Optimization (completed 2026-07-03)
- Single Redis instance (512mb, noeviction) for cache + BullMQ + Socket.io
- pgBouncer connection pooling (transaction mode)
- Real database health checks (SELECT 1, 503 on fail)
- Nginx metrics endpoint restricted to private IPs
- SHOPEE_AFFILIATE_ID optional (scrape degrades gracefully)
- Dockerfile EXPOSE 3066 (port migration from 3001)

### Phase 3: Authentication & JWT Revocation (completed 2026-07-03)
- JWT token revocation via User.tokenVersion (signed as `ver` claim, checked in JwtStrategy + WS gateway)
- Global token version bump on release (idempotent)
- Verify-token endpoint with 24h expiry + resend mechanism
- POST /auth/change-password endpoint
- FollowButton fetches real follow state before render

### Phase 4: Feed Optimization (completed 2026-07-03)
- Explore/trending query bounded to 30 days (prevent bloat)
- ClickLog composite index (postId, ip, createdAt) for efficient dedup + analytics
- Notifications cursor-paginated + PATCH /notifications/:id/read to mark read

### Phase 5: Moderation & Admin (completed 2026-07-03)
- Report + Block models (with ReportReason, ReportStatus, ReportTargetType enums)
- User.isAdmin + User.bannedAt fields
- Admin endpoints: GET /admin/reports, PATCH /admin/reports/:id, DELETE /admin/posts/:id, DELETE /admin/comments/:id, POST/DELETE /admin/users/:id/ban|unban
- First admin via ADMIN_BOOTSTRAP_USERNAME (idempotent on boot, no self-promotion UI)
- Ban mechanism: sets bannedAt + bumps tokenVersion (kills all HTTP + WS sessions instantly)
- Block mechanism: blocked users can't comment/react/bookmark/follow; feed excludes them; profiles return 404

### Phase 6: Social Features Expansion (completed 2026-07-03)
- Reactions table (renamed from likes) with ReactionType enum (LIKE, LOVE, HAHA, WOW, SAD, ANGRY)
- Post.likeCount = total reactions (all types, atomic increment)
- PUT /posts/:id/reactions (upsert/toggle) + GET /posts/:id/reactions/me
- Bookmark model + PUT /posts/:id/bookmark + GET /me/bookmarks + /saved page
- Post.shareCount tracking + POST /posts/:id/share endpoint
- Socket event renamed: like:update → reaction:update

### Phase 7: CI/CD & Observability (completed 2026-07-03)
- GitHub Actions CI (`.github/workflows/ci.yml`):
  - build-and-unit: TypeCheck, unit tests (mocked Prisma, no DB), full build
  - integration-db: Postgres service, migrations apply + drift check (catches un-renamed constraints)
- Structured JSON logging (Pino) in production; pretty-printed in dev
- Prometheus metrics at `/metrics` (rate-limited, private IPs only)
- Sentry integration (backend + frontend, no-op if unset)
- Grafana + Loki (opt-in in docker-compose.monitoring.yml)
- X-Request-ID tracing

## Next Phase Candidates

### Phase 8: Advanced Analytics
- User engagement dashboard (followers growth, post performance, click-through rate)
- Affiliate earnings visualization (clicks → affiliate commission)
- Content recommendation engine (personalized feed based on engagement)
- Trending posts algorithm (score by recency + engagement)

### Phase 9: Content Moderation AI
- Automated content flagging (spam, scam, offensive language)
- User reputation system (upvoted vs downvoted comments/posts)
- Appeal process for banned users

### Phase 10: Mobile App
- React Native / Flutter native mobile client
- Offline-first sync with backend
- Native image compression for uploads

### Phase 11: Internationalization (i18n)
- Multi-language support (Vietnamese, English, etc.)
- Localized category taxonomy
- RTL support if needed

### Phase 12: Payment Integration
- In-app affiliate commission payout (Stripe / PayPal)
- Platform fee deduction
- Transaction history + tax reporting

### Phase 13: Advanced Search
- Meilisearch typo tolerance + facets (by category, date range, price)
- Full-text search with relevance tuning
- Saved searches / search history

### Phase 14: API Stability & Developer Experience
- OpenAPI/Swagger documentation (`@nestjs/swagger`)
- Rate-limit headers (X-RateLimit-*) in all responses
- Versioning strategy (v1, v2) for breaking changes
- Webhook support for third-party integrations

### Phase 15: Multi-Tenant or Federation (lower priority)
- White-label version for partners
- Federation (share reviews across instances via ActivityPub-like protocol)
- Vendor storefronts (mini-shops within shopee.review)

## Technical Debt & Refactoring

- Consolidate notification delivery (SSE + Socket.io have slight timing differences)
- Migrate from cache-manager to native Redis client (better control, less overhead)
- Extract shared types (DTO, Entity) to a common package
- Improve error messages (more specific codes for frontend handling)
- Add request tracing (Jaeger) for multi-service observability

## Unresolved Questions

None at this time.
