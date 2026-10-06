# Deployment Guide

## Overview

Production deployment runs on Coolify. Coolify's Traefik (container `coolify-proxy`, Docker network `coolify`) owns host ports 80/443, routes `Host(shopee.review)` (+ `www.shopee.review` → redirect) to this stack's `nginx` service, and terminates TLS itself via its `letsencrypt` ACME resolver — **there is no certbot container in this stack**; nginx only ever speaks plain HTTP, even in production. Nginx is the single entrypoint for rate-limiting and routing to backend/frontend. Docker Compose orchestrates the app stack (PostgreSQL, pgBouncer, Redis, Meilisearch, backend, frontend, nginx, db-backup); monitoring (Loki/Promtail/Grafana) is a separate, optional compose file.

## Docker Compose Stack

```bash
# Start all services (db, pgbouncer, redis, meilisearch, backend, frontend, nginx, db-backup)
docker compose up -d

# View logs
docker compose logs -f backend  # or frontend, nginx, etc.

# Bring down
docker compose down
```

**Key services:**

| Service | Image | Port | Role |
|---------|-------|------|------|
| `db` | postgres:16-alpine | 5432 | Main database (health-checked); `shared_preload_libraries=pg_stat_statements`, `statement_timeout`/`idle_in_transaction_session_timeout` set via command flags |
| `pgbouncer` | edoburu/pgbouncer (pinned by digest) | 6432 | Connection pooling (transaction mode, 25 default, 5 min, 100 max client conn) |
| `redis` | redis:7.2-alpine | 6379 | Cache, BullMQ, Socket.io, SSE pub/sub; **512mb, noeviction** |
| `meilisearch` | getmeili/meilisearch:v1.10 | 7700 | Full-text search (512mb limit) |
| `backend` | From Dockerfile | 3066 | NestJS API, runs as a non-root user |
| `frontend` | From Dockerfile | 3000 | Next.js 15 frontend, runs as a non-root user |
| `nginx` | nginx:1.27-alpine | 8081 | Rate-limit, route, microcache; master runs root (standard for this image), workers drop to `nginx` (`user nginx;` in nginx.conf) |
| `db-backup` | prodrigestivill/postgres-backup-local:16 | — | Daily gzip dumps to `./backups`, `umask 0077` (dirs 700 / files 600) |

Every service sets `mem_limit`/`cpus` and json-file log rotation (`max-size: 10m`, `max-file: 3`) — this host runs ~10 other projects, so an unbounded leak (e.g. a stuck Playwright/Chromium process in the scraper fallback) must not be able to starve the rest of the machine.

## Environment Configuration

Root `.env` file (checked into version control but **DO NOT commit secrets**):

### Database & Pooling

```env
# REQUIRED — db/pgbouncer/db-backup refuse to boot if unset (no insecure
# default). Use `-hex`, NOT `-base64`: a base64 password can contain `/` or
# `+`, which corrupts the DATABASE_URL/DIRECT_URL below (the password is
# embedded directly in a postgresql:// URL).
POSTGRES_PASSWORD=<strong password, e.g. openssl rand -hex 32>
# Host dev: direct to Postgres. Docker/prod: point DATABASE_URL at pgBouncer.
# No per-connection `options=-c statement_timeout=...` here (L5) — tried and
# verified NOT to work through pgBouncer in transaction-pooling mode (it
# silently drops the parameter instead of forwarding it; see the
# "Postgres role rotation" section's statement_timeout caveat). One generous
# global value on the `db` service's command flags covers this path too.
DATABASE_URL=postgresql://shopee_review_app:<same password as POSTGRES_PASSWORD>@pgbouncer:6432/shopee_review?pgbouncer=true&connection_limit=15
# Non-pooled for migrations (Prisma directUrl). Always points to Postgres.
DIRECT_URL=postgresql://shopee_review_app:<same password as POSTGRES_PASSWORD>@db:5432/shopee_review
```

> **Two Postgres roles, one password.** `shopee_review` is the bootstrap
> superuser the official `postgres` image creates on first init (from
> `POSTGRES_USER`) — nothing in this stack connects as it after that. The app,
> pgBouncer and db-backup all connect as `shopee_review_app`, created by
> `postgres/init/01-app-role.sh` and made the database's owner — **not** a
> superuser. Postgres hard-blocks stripping `SUPERUSER` from the bootstrap
> role itself ("the bootstrap user must have the SUPERUSER attribute"), which
> is why this needs a second role rather than demoting the first one. Both
> share `POSTGRES_PASSWORD` for simplicity. See "Postgres role rotation" below
> for applying this to an already-running database.

### Ports & TLS

```env
PORT=3066                      # Backend port
DOMAIN=shopee.review           # Coolify's Traefik routes Host($DOMAIN) + www.$DOMAIN here
COOKIE_SECURE=true             # HTTPS only (set to false for HTTP dev)
```

> **No `CERTBOT_EMAIL`, no certbot container.** Coolify's Traefik (`coolify-proxy`)
> terminates TLS and issues/renews the Let's Encrypt certificate itself via its
> `letsencrypt` resolver — this stack's nginx always speaks plain HTTP (see
> "Nginx Configuration" below). The only prerequisite is DNS: an A record for
> `shopee.review` (and `www.shopee.review`, which redirects to the apex) must
> point at this host's public IP before Traefik can complete the ACME
> HTTP-01 challenge. Until DNS is live, Traefik's HTTPS router for this
> `Host()` rule will fail to issue a certificate and retry quietly in the
> background — it does not block the app, which stays reachable over the
> SSH-tunnel/loopback path described in "Remote development" below.

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

Logs only — no Prometheus, no `/metrics` endpoint, no `MetricsModule`:

```env
REDIS_URL=redis://redis:6379                    # Required for BullMQ + Socket.io in Docker/prod
MEILI_HOST=http://meilisearch:7700              # Meilisearch search engine
MEILI_MASTER_KEY=masterKeyChangeMe              # Change this!
ADMIN_TOKEN=<random-token>                      # Bull Board dashboard auth
SENTRY_DSN=<backend project DSN>                # Error tracking (no-op if unset)
NEXT_PUBLIC_SENTRY_DSN=<frontend project DSN>   # Frontend error tracking
LOG_LEVEL=info                                  # trace|debug|info|warn|error (empty = default per NODE_ENV)
GRAFANA_PASSWORD=<strong password>              # For docker-compose.monitoring.yml (Loki datasource only)
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

Single entrypoint for rate-limiting, microcaching, WebSocket proxying, and routing. Nginx only ever speaks plain HTTP — Coolify's Traefik terminates real TLS in front of it and forwards over the private `coolify` Docker network, so `Strict-Transport-Security` is set unconditionally in `nginx/conf.d/app.conf` (every client that sees it really did arrive over HTTPS). There is no ACME webroot location and no `app-tls.conf` variant: TLS is entirely Traefik's responsibility, not nginx's.

**Rate-limiting zones** (per client IP):
- General API (`/api/*`): 10/s
- Auth endpoints (`/api/auth/*`): 5/m
- Upload endpoint (`/api/uploads/*`): 2/s
- WebSocket (`/socket.io/*`): 100/s

**Special routes:**

| Route | Target | Notes |
|-------|--------|-------|
| `/socket.io/*` | Backend:3066 | WebSocket, no buffering |
| `/api/notifications/stream` | Backend:3066 | SSE, no buffering, 1h timeout |
| `/api/auth/*` | Backend:3066 | Strict rate-limit (5/m) |
| `/api/uploads/*` | Backend:3066 | Upload rate-limit, 12MB body limit |
| `/api/*` | Backend:3066 | General API, 2s microcache for unauthenticated GET |
| `/admin/queues` | Backend:3066 | Bull Board dashboard (auth enforced in app) |
| `/r/:postId` | Backend:3066 | Click tracking redirect |
| `/_next/static/*` | Frontend:3000 | Next.js static (long cache: 60m cache, 1y expires) |
| `/*` | Frontend:3000 | Fallback to frontend |

**TLS**: entirely Coolify Traefik's job — it issues/renews the Let's Encrypt certificate via its `letsencrypt` resolver and terminates HTTPS before traffic ever reaches this stack. Nginx has no TLS config of its own; `docker-compose.yml`'s `nginx` labels declare the `Host()` routers (apex + `www` redirect) that Traefik reads.

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

**Automated daily backups** (via db-backup service): `umask 0077` wraps the container's entrypoint, so every dump lands `600` and every directory it creates under `./backups` lands `700` (the image itself has no mode/permission env var — PII such as emails and bcrypt hashes was previously world-readable at `644`). One-time setup on a host that doesn't already have the directory:

```bash
mkdir -p backups && chmod 700 backups
```

```bash
# Dumps are in ./backups on the host
ls -la ./backups/

# Restore from latest (onto the LIVE db — only for an actual disaster recovery)
gunzip -c ./backups/last/<file>.sql.gz | docker compose exec -T db psql -U shopee_review -d shopee_review
```

**Restore-test (monthly drill)** — verifies a backup is actually restorable, against a disposable container, never the live DB:

```bash
docker run --rm -d --name pg-restore-test \
  -e POSTGRES_USER=shopee_review -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=shopee_review \
  postgres:16-alpine
sleep 5
gunzip -c backups/daily/<file>.sql.gz \
  | docker exec -i pg-restore-test psql -U shopee_review -d shopee_review -v ON_ERROR_STOP=1 -q
docker exec pg-restore-test psql -U shopee_review -d shopee_review -c \
  "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM posts) AS posts;"
docker rm -f pg-restore-test
```

**Offsite backups are a follow-up, not yet built.** `./backups` lives on the
same disk as everything else (`archive_mode=off`, so RPO is up to 24h with no
PITR). Cloudflare R2 credentials already exist for uploads — the natural next
step is an `rclone`/`aws s3 sync` cron pushing `./backups` to a private R2
bucket, encrypted at rest.

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

## Postgres Role Rotation (rolling a live DB onto the non-superuser setup)

A fresh `docker compose up -d db` (empty `pgdata` volume) already gets this for
free: `postgres/init/01-app-role.sh` runs once, creates `pg_stat_statements`,
creates `shopee_review_app` (`NOSUPERUSER`), and makes it the database owner —
and since PostgreSQL 15, a fresh database's `public` schema is owned by the
pseudo-role `pg_database_owner` (always resolving to whoever owns the
database), so that one `ALTER DATABASE ... OWNER TO` is enough for a brand-new
volume.

**On an already-running database this does NOT work.** `docker-entrypoint-
initdb.d` scripts only run against a brand-new data directory, and on the live
server today every table, sequence, materialized view, and the `public`
schema itself are all still owned by `shopee_review` (the bootstrap
superuser) — `ALTER DATABASE ... OWNER TO shopee_review_app` only changes who
owns the *database object*, not any of the tables inside it, so
`shopee_review_app` would get `permission denied` on its very first query and
`prisma migrate deploy` would fail outright (pre-deploy review C2 — confirmed
against the live DB). In-place ownership rotation (`REASSIGN OWNED BY` /
per-object `ALTER TABLE ... OWNER TO`) is possible in principle, but this
app's data is disposable seed data, so the simpler and more certain path is:
dump the data, stand up a brand-new (and therefore correctly-owned) volume,
and restore into it.

**Do not run these against the live stack without a human explicitly approving
it first** — this is a maintenance-window operation (the stack is down for
the dump→restore gap) and changes the role the whole app authenticates as.
This exact sequence was rehearsed end-to-end against a copy of the live data
in a disposable dev stack before being written here — see the pre-deploy-fixes
report for the rehearsal transcript.

```bash
# 0. If .env has no POSTGRES_PASSWORD yet (pre-deploy review C3 — true on live
#    today), generate one now. Use `-hex`, NOT `-base64` (C4): a base64 password
#    can contain `/` or `+`, which corrupts DATABASE_URL/DIRECT_URL (they embed
#    the password directly in a postgresql:// URL, where `/` is a path
#    separator and `+` can be interpreted during URL decoding).
openssl rand -hex 32   # → paste into .env as POSTGRES_PASSWORD

# 1. Backup first (always), AND read-only — pg_dump takes no locks that block
#    writers and changes nothing in the database. Custom format (-Fc): smaller,
#    supports --no-owner/--no-acl on restore (below), and is what pg_restore
#    (not plain psql) consumes.
docker compose exec -T db pg_dump -U shopee_review -d shopee_review -Fc \
  > backups/manual/pre-role-rotation-$(date +%Y%m%d-%H%M%S).dump

# 2. Take the stack down. The dump above already captured a consistent
#    snapshot, so this gap is the only real downtime window.
docker compose down

# 3. Remove ONLY the Postgres volume — pgdata is what carries the old
#    ownership forward; redis/meili volumes are disposable cache/index state
#    the backend already knows how to rebuild (reindexAll, cache repopulation)
#    and don't need to be touched.
docker volume rm shopeereview_pgdata

# 4. Bring up just `db` on the new (empty) volume. This is the normal boot
#    path, not a special case: 01-app-role.sh runs automatically against the
#    brand-new data directory, creates shopee_review_app LOGIN with
#    POSTGRES_PASSWORD from .env, NOSUPERUSER, and makes it the database AND
#    (via pg_database_owner) the public schema owner.
docker compose up -d db
docker compose exec -T db pg_isready -U shopee_review

# 5. Restore AS shopee_review_app (not the bootstrap superuser) so every
#    restored object is owned by it from the moment it's created — no
#    separate ownership-transfer step needed. --no-owner/--no-acl: skip the
#    dump's recorded "owned by shopee_review" / grant statements, which would
#    otherwise try to re-assign ownership back to a role this restore
#    connection doesn't have privileges to reassign to/from anyway.
docker compose exec -T db pg_restore --no-owner --no-acl \
  -U shopee_review_app -d shopee_review \
  < backups/manual/pre-role-rotation-<timestamp>.dump

# 6. Start the rest of the stack. The backend's entrypoint runs
#    `prisma migrate deploy` as shopee_review_app (DIRECT_URL) before serving
#    traffic — this applies any migration newer than the dump (at minimum the
#    two from this fix: moderation levels/soft delete/indexes, and the
#    notification ordering index) using the now-correctly-owned schema.
docker compose up -d

# 7. Verify (see the three checks below): shopee_review_app is NOT a
#    superuser, owns every relation, and the app actually serves data.
```

Verification queries:

```sql
-- (a) Not a superuser.
SELECT rolname, rolsuper FROM pg_roles WHERE rolname = 'shopee_review_app';

-- (b) Every table/index/sequence/materialized view is owned by it (empty
--     result = fully rotated; anything listed here is still
--     shopee_review-owned and would 403 the app on that object).
SELECT relname, relkind, pg_get_userbyid(relowner) AS owner
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind IN ('r', 'i', 'S', 'm')
  AND pg_get_userbyid(relowner) <> 'shopee_review_app';
```

```bash
# (c) db-backup (also connects as shopee_review_app) can actually dump.
docker compose exec -T db-backup /backup.sh && echo OK
```

**Caveat** (L5): `statement_timeout=60000` (60s, set globally on the `db`
service's command flags) applies to EVERY connection on `shopee_review_app` —
API queries through pgBouncer, `pg_dump`/`pg_restore` (step 1/5 above and the
daily db-backup job), and `prisma migrate deploy` alike. One value for every
path, not a tighter one for the hot API path, because the tighter alternative
doesn't actually work: a per-connection override via DATABASE_URL's
`options=-c statement_timeout=...` was tried and verified in the pre-deploy
rehearsal to have no effect through pgBouncer in transaction-pooling mode —
listing `options` in pgBouncer's `ignore_startup_parameters` stops it
erroring on the parameter, but the parameter is then genuinely dropped, not
forwarded to the real Postgres session (`SHOW statement_timeout` on a
connection made through pgBouncer with that option set still showed the
server's global default). 60s is generous enough not to abort a backup or
migration at the current (seed-sized) data volume; if a table grows large
enough that a single backup `COPY` or migration step would exceed it, raise
it (`ALTER ROLE shopee_review_app SET statement_timeout = '...'` persists
past restarts, or bump the `db` service's `-c statement_timeout=...` command
flag) rather than reaching for the per-connection `options=` approach again.

## Scaling

- **Backend**: Stateless; can run multiple instances behind a load balancer. Redis must be shared for cache coherence + BullMQ job state.
- **Frontend**: Stateless; can run multiple instances behind a load balancer.
- **Database**: PostgreSQL replication (setup beyond this guide); always use DIRECT_URL for migrations.
- **Redis**: Single instance with persistence (appendonly yes, appendfsync everysec). Ensure `--maxmemory-policy noeviction` to prevent silent BullMQ job loss.
- **Meilisearch**: Single instance; index syncs via API calls from the backend.

## Remote Development (editing on a laptop, running on the server)

The server is the source of truth: `docker-compose.yml` publishes only
`127.0.0.1:8081` (nginx) and `127.0.0.1:65432` (Postgres) — backend (3066) and
frontend (3000) are `expose`d on the compose network only, never bound to the
host. That means a host-side `pnpm --filter @app/backend dev` on the server
does **not** conflict with the running containers (different listener, same
port number is fine since the container never claimed it on the host). To
reach it from a laptop:

```bash
# From your laptop:
ssh -L 3066:127.0.0.1:3066 -L 3000:127.0.0.1:3000 -L 8081:127.0.0.1:8081 <host>
# Then on the SERVER (same session or another), run the dev servers directly:
pnpm --filter @app/backend dev     # binds host-side 3066
pnpm --filter @app/frontend dev    # binds host-side 3000 (proxies /api in dev)
# Point DATABASE_URL at 127.0.0.1:65432 (already published) for either process.
```

Prefer editing on the server over editing via one-off SSH commands and
forgetting to commit — `.dockerignore`'s `**/node_modules` fix shipped this
way once (fixed locally here, was already applied uncommitted on the server).
If you do edit directly on the server, commit from there (or `git diff` → copy
back) before the next `rsync --delete` from the laptop overwrites it.

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
