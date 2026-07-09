# Deployment Guide

## Overview

Production deployment runs on Coolify with Traefik managing Let's Encrypt TLS, Nginx as the single entrypoint for rate-limiting and routing, and Docker Compose orchestrating the full stack (PostgreSQL, pgBouncer, Redis, Meilisearch, backend, frontend, certbot).

## Docker Compose Stack

```bash
# Start all services (db, pgbouncer, redis, meilisearch, backend, frontend, nginx, certbot, db-backup)
docker compose up -d

# View logs
docker compose logs -f backend  # or frontend, nginx, etc.

# Bring down
docker compose down
```

**Key services:**

| Service | Image | Port | Role |
|---------|-------|------|------|
| `db` | postgres:16-alpine | 5432 | Main database (health-checked) |
| `pgbouncer` | edoburu/pgbouncer | 6432 | Connection pooling (transaction mode, 10 default, 5 min, 100 max client conn) |
| `redis` | redis:7.2-alpine | 6379 | Cache, BullMQ, Socket.io, SSE pub/sub; **512mb, noeviction** |
| `meilisearch` | getmeili/meilisearch:v1.10 | 7700 | Full-text search (512mb limit) |
| `backend` | From Dockerfile | 3066 | NestJS API |
| `frontend` | From Dockerfile | 3000 | Next.js 15 frontend |
| `nginx` | nginx:1.27-alpine | 8081 | Rate-limit, route, microcache |
| `certbot` | certbot/certbot | — | Let's Encrypt renewal (webroot mode) |
| `db-backup` | prodrigestivill/postgres-backup-local:16 | — | Daily gzip dumps to ./backups |

## Environment Configuration

Root `.env` file (checked into version control but **DO NOT commit secrets**):

### Database & Pooling

```env
# Host dev: direct to Postgres. Docker/prod: point DATABASE_URL at pgBouncer.
DATABASE_URL=postgresql://shopee_review:shopee_review_dev@pgbouncer:6432/shopee_review?pgbouncer=true&connection_limit=1
# Non-pooled for migrations (Prisma directUrl). Always points to Postgres.
DIRECT_URL=postgresql://shopee_review:shopee_review_dev@db:5432/shopee_review
```

### Ports & TLS

```env
PORT=3066                      # Backend port
DOMAIN=shopee.review           # Traefik domain (production)
COOKIE_SECURE=true             # HTTPS only (set to false for HTTP dev)
CERTBOT_EMAIL=admin@example.com # Let's Encrypt notifications
```

### Frontend/API URLs

```env
FRONTEND_URL=https://shopee.review              # Trusted origin(s) for CORS + OAuth redirect (comma-separated)
API_INTERNAL_URL=http://backend:3066/api        # SSR → backend, internal compose network (server-only)
```

> **Browser API base is RELATIVE (`/api`).** The client bundle no longer bakes
> `NEXT_PUBLIC_API_URL` at build time — the browser calls the API same-origin via
> nginx (which fronts `/api`, `/uploads`, `/r`, `/socket.io`). One frontend image
> therefore runs on any host/port. Do NOT reintroduce a `NEXT_PUBLIC_API_URL`
> build-arg. (`pnpm dev` proxies these paths to the backend via a Next dev rewrite.)

### Authentication

```env
JWT_SECRET=<random-32+-chars>                    # REQUIRED — compose refuses to boot if unset (no fallback)
ADMIN_BOOTSTRAP_USERNAME=your_username_here     # Comma-separated; idempotent on boot, no self-promotion UI
```

> **`JWT_SECRET` is mandatory.** `docker-compose.yml` uses `${JWT_SECRET:?...}`, so
> the stack fails fast if it is unset (previously a public `change-me...` fallback
> silently signed tokens — an auth-bypass if forgotten). Generate with
> `openssl rand -base64 48`; the same value must be shared by backend + frontend
> (the Next middleware verifies the same HS256 token and fails closed without it).

### Google OAuth

```env
GOOGLE_CLIENT_ID=<from Google Console>
GOOGLE_CLIENT_SECRET=<from Google Console>
GOOGLE_CALLBACK_URL=https://shopee.review/api/auth/google/callback
```

### Email (Resend)

```env
RESEND_API_KEY=<from Resend dashboard>
MAIL_FROM=shopee.review <onboarding@resend.dev>  # Display sender (Resend sandbox: onboarding@resend.dev)
```

### Cloudflare R2 (Image Uploads)

```env
CLOUDFLARE_ACCOUNT_ID=<your account ID>
R2_ACCESS_KEY_ID=<API token access key>
R2_SECRET_ACCESS_KEY=<API token secret>
R2_BUCKET_NAME=shopee-review-uploads
R2_PUBLIC_URL=https://pub-<hash>.r2.dev         # Or custom domain; no trailing slash
```

When R2 env vars are absent, uploads reject with a clear 500 error and log a warning (safe to leave empty in non-prod).

### Scraper & Affiliate

```env
SHOPEE_AFFILIATE_ID=                            # Optional. If unset, scrape degrades to product URL as affiliate link.
```

### Monitoring & Observability

```env
REDIS_URL=redis://redis:6379                    # Required for BullMQ + Socket.io in Docker/prod
MEILI_HOST=http://meilisearch:7700              # Meilisearch search engine
MEILI_MASTER_KEY=masterKeyChangeMe              # Change this!
ADMIN_TOKEN=<random-token>                      # Bull Board dashboard auth
SENTRY_DSN=<backend project DSN>                # Error tracking (no-op if unset)
NEXT_PUBLIC_SENTRY_DSN=<frontend project DSN>   # Frontend error tracking
LOG_LEVEL=info                                  # trace|debug|info|warn|error (empty = default per NODE_ENV)
GRAFANA_PASSWORD=<strong password>              # For docker-compose.monitoring.yml
```

## First-Admin Bootstrap

On backend startup, any username in `ADMIN_BOOTSTRAP_USERNAME` is granted `is_admin = true` (idempotent):

```env
ADMIN_BOOTSTRAP_USERNAME=alice,bob
```

- If the user doesn't exist, they are created with `is_admin = true` and email unverified.
- If the user exists, `is_admin` is set to true (one-time setup per app lifetime).
- **No self-promotion UI** — you must set this env var once and restart the backend.

## Cloudflare R2 Setup

1. **Create a bucket** in Cloudflare dashboard → R2 → *Create bucket* (e.g., `shopee-review-uploads`).
2. **Create an API token**: R2 → *Manage R2 API Tokens* → *Create API Token*.
   - Permission: **Object Read & Write**, scope to this bucket only.
   - Copy **Access Key ID** and **Secret Access Key**.
3. **Get Account ID** from R2 overview page (right sidebar).
4. **Enable public access**: Bucket → *Settings* → *Public access* → Note the `https://pub-<hash>.r2.dev` URL.
5. **Optional custom domain**: Attach a custom domain (e.g., `images.shopee.review`); then add it to `next.config.ts`'s `remotePatterns`.

Set env vars:
```env
CLOUDFLARE_ACCOUNT_ID=<account-id>
R2_ACCESS_KEY_ID=<access-key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=shopee-review-uploads
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

Frontend's `next.config.ts` already allows `**.r2.dev` and `**.r2.cloudflarestorage.com`. For custom domains, add a pattern.

## Sentry Error Tracking

Both backend and frontend integrate Sentry and are no-ops when DSNs are unset (so dev/non-configured environments are unaffected).

- **Backend**: `@sentry/nestjs`, initialized in `apps/backend/src/instrument.ts` (imported first in `main.ts`). Reads `SENTRY_DSN`.
- **Frontend**: `@sentry/nextjs`, configured via multiple files and `withSentryConfig` in `next.config.ts`. Reads `NEXT_PUBLIC_SENTRY_DSN`.

Env vars:
```env
SENTRY_DSN=<backend project DSN>
NEXT_PUBLIC_SENTRY_DSN=<frontend project DSN>
SENTRY_ORG=<org-slug>           # Only for source map uploads during prod builds
SENTRY_PROJECT=<project-slug>
SENTRY_AUTH_TOKEN=<token>
```

PII scrubbing is on by default (cookies, auth headers stripped in `beforeSend`).

## Nginx Configuration

Single entrypoint for rate-limiting, microcaching, WebSocket proxying, and routing.

**Rate-limiting zones** (per client IP):
- General API (`/api/*`): 10/s
- Auth endpoints (`/api/auth/*`): 5/m
- Upload endpoint (`/api/uploads/*`): 2/s
- WebSocket (`/socket.io/*`): 100/s

**Special routes:**

| Route | Target | Notes |
|-------|--------|-------|
| `/.well-known/acme-challenge/*` | Local webroot | Let's Encrypt validation (no redirect, plain HTTP) |
| `/socket.io/*` | Backend:3066 | WebSocket, no buffering |
| `/api/notifications/stream` | Backend:3066 | SSE, no buffering, 1h timeout |
| `/api/auth/*` | Backend:3066 | Strict rate-limit (5/m) |
| `/api/uploads/*` | Backend:3066 | Upload rate-limit, 12MB body limit |
| `/api/*` | Backend:3066 | General API, 2s microcache for unauthenticated GET |
| `/admin/queues` | Backend:3066 | Bull Board dashboard (auth enforced in app) |
| `/r/:postId` | Backend:3066 | Click tracking redirect |
| `/metrics` | Backend:3066 | Prometheus metrics (restricted to private IPs: 127.0.0.1, 172.16.0.0/12, 10.0.0.0/8) |
| `/_next/static/*` | Frontend:3000 | Next.js static (long cache: 60m cache, 1y expires) |
| `/*` | Frontend:3000 | Fallback to frontend |

**TLS**: Traefik handles Let's Encrypt via ACME http-01 (certbot renewal every 12h). Edit `nginx/conf.d/app-tls.conf.disabled` → rename to `app.conf` to enable HSTS and redirect HTTP → HTTPS.

## Health Checks

Each service exposes a health endpoint:

```bash
# Backend (Node.js fetch call)
curl http://localhost:3066/api/health

# Frontend (HTTP status)
curl http://localhost:3000/

# Database
docker compose exec db pg_isready -U shopee_review

# Redis
docker compose exec redis redis-cli ping

# Meilisearch
curl http://localhost:7700/health
```

## Backup & Restore

**Automated daily backups** (via db-backup service):
```bash
# Dumps are in ./backups on the host
ls -la ./backups/

# Restore from latest
gunzip -c ./backups/last/<file>.sql.gz | docker compose exec -T db psql -U shopee_review -d shopee_review
```

## Database Migrations

Migrations apply automatically on backend startup (Prisma migrate deploy via healthcheck + depends_on), but you can run manually:

```bash
# Generate migration file
pnpm --filter @app/database db:migrate:create -- --name <description>

# Apply migrations in Docker
docker compose exec backend pnpm --filter @app/database db:migrate:deploy

# Introspect (pull schema from DB)
docker compose exec backend pnpm --filter @app/database db:introspect
```

## Scaling

- **Backend**: Stateless; can run multiple instances behind a load balancer. Redis must be shared for cache coherence + BullMQ job state.
- **Frontend**: Stateless; can run multiple instances behind a load balancer.
- **Database**: PostgreSQL replication (setup beyond this guide); always use DIRECT_URL for migrations.
- **Redis**: Single instance with persistence (appendonly yes, appendfsync everysec). Ensure `--maxmemory-policy noeviction` to prevent silent BullMQ job loss.
- **Meilisearch**: Single instance; index syncs via API calls from the backend.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Login fails after deploy | JWT_SECRET changed | Invalidate browser cookies, re-login. Or use ADMIN_BOOTSTRAP_USERNAME to set a new admin. |
| Clicks not tracked correctly | `trust proxy` misconfigured or proxy hop count mismatch | Verify `trust proxy` setting in main.ts matches Nginx→Backend hops. Check `/api/health` for correct client IP. |
| SSE notifications not delivered | Nginx buffering interference | Verify `proxy_buffering off` in `/api/notifications/stream` location. |
| WebSocket drops | Rate-limit too strict or timeout misconfigured | Increase `ws_limit` zone or proxy timeouts in Nginx. |
| Search not working | Meilisearch not running or MEILI_HOST unset | `docker compose ps meilisearch`; fallback to PostgreSQL full-text search if Meilisearch down. |
| Out of Redis memory | Cache keys not expiring or job queue backlog | Check cache TTL (default 60s), monitor BullMQ queue sizes. Increase Redis maxmemory if capacity needed. |
| Cloudflare R2 uploads fail | Credentials invalid or bucket misconfigured | Verify R2 env vars; check bucket permissions. Uploads log clear 500 if credentials missing. |

## Verification Checklist

```bash
# 1. Services running
docker compose ps

# 2. Health endpoints
curl http://localhost:8081/api/health
curl http://localhost:8081/

# 3. Database connectivity (from backend logs)
docker compose logs backend | grep "Connected to database"

# 4. Redis available
docker compose exec redis redis-cli ping

# 5. Meilisearch available
curl http://localhost:7700/health

# 6. JWT working (signup + login flow)
# (Full E2E verification in browser)

# 7. Click tracking (post creation + affiliate link redirect)
# (Verify ClickLog entries in database)

# 8. Real-time notifications (Socket.io + SSE)
# (Open dev console, trigger a like, check Network tab for /api/notifications/stream)
```

## Notes

- **No ADMIN_PASSWORD env var**: Admin access is identity-based (isAdmin flag on User model); bootstrapped via ADMIN_BOOTSTRAP_USERNAME.
- **SHOPEE_AFFILIATE_ID optional**: If unset, product scraping gracefully degrades to the plain product URL; users paste their own affiliate ID when writing the review.
- **Local uploads removed**: Image uploads now go to Cloudflare R2 only (configured via env vars).
- **Port 3001 retired**: Backend now runs on port 3066.
