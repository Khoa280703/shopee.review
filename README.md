# shopee.review

Nền tảng xã hội review sản phẩm Shopee: bất kỳ ai cũng có thể đăng bài review kèm affiliate link để kiếm thu nhập. Người dùng paste link Shopee, hệ thống tự scrape thông tin sản phẩm (API-first, fallback Playwright, cache 24h), người dùng viết review + nhập affiliate link riêng rồi publish.

## Stack

- pnpm workspace + Turborepo
- **NestJS API**: `apps/backend`, port 3066, runs 23+ modules (auth, users, posts, social, notifications, feed, stats, tracker, search, categories, scraper, uploads, metrics, maintenance, blocks, moderation, queue, redis, meilisearch, prisma)
- **Next.js 15 (App Router) frontend**: `apps/frontend`, port 3000
- **Prisma 6 + PostgreSQL 16**: `packages/database`
- **Auth**: JWT HttpOnly cookie + Google OAuth (Passport)
- **Email**: Resend for verification
- **Image upload**: Cloudflare R2 (S3-compatible)
- **Cache**: Redis 7.2 (512mb, noeviction) — powers cache-manager, BullMQ, Socket.io, SSE pub/sub
- **Connection pooling**: pgBouncer (transaction mode)
- **Realtime**: Server-Sent Events (SSE, Nginx no-buffering) + Socket.io (Redis adapter)
- **Search**: Meilisearch (primary) + PostgreSQL full-text fallback
- **Routing**: Nginx (rate-limit, gzip, microcache)
- **Container**: Docker Compose + Traefik (Coolify) + Let's Encrypt (certbot)
- **Monitoring**: Prometheus, Grafana, Loki, Sentry, structured JSON logging (Pino)
- **CI/CD**: GitHub Actions (build+unit, integration-db with drift-check)

## Tính năng chính

- **Đăng ký/đăng nhập**: Email xác minh (Resend) + Google OAuth
- **Trang cá nhân**: Path-based `/@username` (profile card, follow/unfollow, block/unblock)
- **Đăng bài review**: Auto-scrape Shopee sản phẩm → hiển thị metadata (giá, hình) → upload ảnh R2 → affiliate link (bắt buộc, được gợi ý từ SHOPEE_AFFILIATE_ID nếu có)
- **Tương tác xã hội**:
  - **Reactions**: Like, Love, Haha, Wow, Sad, Angry (6 loại) thay vì chỉ Like
  - **Comments**: Reply 1 cấp, nested thread (không quá 2 mức sâu)
  - **Bookmarks**: Lưu bài review vào danh sách `/saved`
  - **Share**: Chia sẻ bài review
  - **Follow/Unfollow**: Theo dõi tác giả
  - **Block**: Chặn người dùng (không thấy bài viết, không nhận comment/reaction, hồ sơ 404)
- **Bảng tin**: Feed cá nhân (bài từ người theo dõi, loại trừ người bị chặn/bị ban)
- **Thông báo realtime**: SSE + Socket.io (khi có reaction, comment, follow, mention)
- **Click tracking**: `/r/:postId` redirect, dedup 1h/IP, thống kê click/user
- **Tìm kiếm**: Meilisearch (nhanh, typo tolerance) hoặc fallback PostgreSQL FTS
- **Trending**: Bài hot (bounded 30 ngày, score by engagement)
- **Moderation**:
  - Report (spam, scam, offensive, fake, other)
  - Admin approve/dismiss report → delete post/comment hoặc ban user
  - User.bannedAt → tokenVersion++ → kill all sessions
  - First admin: ADMIN_BOOTSTRAP_USERNAME env var (idempotent, no self-promotion UI)
- **SEO**: Sitemap, robots.txt, JSON-LD schema

## Local Setup

```bash
pnpm install
docker compose up -d db
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
```

Run dev servers:

```bash
# Terminal 1: Backend
pnpm --filter @app/backend dev

# Terminal 2: Frontend
pnpm --filter @app/frontend dev
```

Default URLs:

- Frontend: `http://localhost:5166`
- Backend: `http://localhost:3066/api`

## Environment

Root `.env` file (xem `.env.example`):

### Core

| Var | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | `postgresql://shopee_review:shopee_review_dev@localhost:65432/shopee_review` | Host dev: direct to Postgres. Docker: point at pgBouncer:6432. |
| `DIRECT_URL` | Same as DATABASE_URL | Non-pooled for migrations. |
| `NODE_ENV` | `development` | development or production |
| `PORT` | `3066` | Backend port |
| `JWT_SECRET` | 32+ random chars | Đổi thành secret mạnh |
| `COOKIE_SECURE` | `false` (dev), `true` (prod over HTTPS) | HTTPS only flag for auth cookie |

### URLs

| Var | Value | Notes |
|-----|-------|-------|
| `DOMAIN` | `localhost` (dev), `shopee.review` (prod) | Traefik routing domain |
| `FRONTEND_URL` | `http://localhost:5166` | Backend CORS origin; what frontend sees as home |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3066/api` | Browser-visible API endpoint |
| `API_INTERNAL_URL` | `http://localhost:3066/api` | Backend→frontend SSR calls (internal network) |

### Auth & Email

| Var | Value | Notes |
|-----|-------|-------|
| `GOOGLE_CLIENT_ID` | From Google Console | OAuth callback at `/api/auth/google/callback` |
| `GOOGLE_CLIENT_SECRET` | From Google Console | — |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3066/api/auth/google/callback` | — |
| `RESEND_API_KEY` | From Resend dashboard | Email verify links in console if unset (dev) |
| `MAIL_FROM` | `shopee.review <onboarding@resend.dev>` | Sender display; Resend sandbox: `onboarding@resend.dev` |
| `ADMIN_BOOTSTRAP_USERNAME` | Username (comma-separated) | Idempotent on boot; grants `is_admin = true` |

### Image Uploads

| Var | Value | Notes |
|-----|-------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | Your R2 account ID | Required if R2 is used; uploads fail with 500 if missing |
| `R2_ACCESS_KEY_ID` | API token access key | From R2 API token creation |
| `R2_SECRET_ACCESS_KEY` | API token secret | — |
| `R2_BUCKET_NAME` | `shopee-review-uploads` | Custom bucket name |
| `R2_PUBLIC_URL` | `https://pub-xxx.r2.dev` | Public URL (no trailing slash); custom domain OK |

### Scraper & Affiliate

| Var | Value | Notes |
|-----|-------|-------|
| `SHOPEE_AFFILIATE_ID` | Your Shopee affiliate ID (optional) | If unset, scrape degrades to plain product URL; users paste own affiliateId |

### Observability

| Var | Value | Notes |
|-----|-------|-------|
| `REDIS_URL` | `redis://redis:6379` (Docker) | Leave empty in host dev; queues degrade gracefully |
| `MEILI_HOST` | `http://meilisearch:7700` (Docker), empty (dev) | Empty = fallback to PostgreSQL FTS |
| `MEILI_MASTER_KEY` | `masterKeyChangeMe` | Change in production |
| `ADMIN_TOKEN` | Random token | Bull Board dashboard auth (when REDIS_URL set) |
| `SENTRY_DSN` | From Sentry backend project | Error tracking; no-op if unset |
| `NEXT_PUBLIC_SENTRY_DSN` | From Sentry frontend project | — |
| `LOG_LEVEL` | `trace\|debug\|info\|warn\|error` | Empty = default per NODE_ENV |
| `GRAFANA_PASSWORD` | Strong password | For docker-compose.monitoring.yml |

### HTTPS & Backups

| Var | Value | Notes |
|-----|-------|-------|
| `CERTBOT_EMAIL` | Your email | Let's Encrypt notifications |

> **Placeholders**: Google OAuth, Resend, R2, Sentry are optional; app boots normally but features degrade (verify link logged to console, uploads fail with 500, etc.).

## Deploy

See [docs/deployment-guide.md](docs/deployment-guide.md) for full Coolify + Traefik + Nginx + Docker Compose setup.

Quick start: `.env` → `docker compose up -d` → Traefik routes `https://shopee.review` → Nginx → Backend + Frontend.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- **build-and-unit**: Type-check, unit tests (mocked Prisma, no DB), full build
- **integration-db**: Postgres service, apply migrations, drift-check (catches schema mismatches)

Runs on every push to `master` and pull request.

## Documentation

| File | Purpose |
|------|---------|
| [docs/system-architecture.md](docs/system-architecture.md) | Services, data flows, security, deploy topology |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Docker Compose, env vars, R2 setup, health checks, troubleshooting |
| [docs/development-roadmap.md](docs/development-roadmap.md) | Completed phases (MVP → Security → Social → Moderation), next candidates |
| [docs/project-changelog.md](docs/project-changelog.md) | Version history by phase |

## Architecture Highlights

- **JWT revocation**: User.tokenVersion signed in JWT; bumped on password change or ban → invalidates all prior tokens instantly
- **Open-redirect fix**: Product URL validation (Shopee only); no arbitrary affiliate URLs
- **CORS exact-match**: No startsWith to prevent subdomain bypasses
- **SSE streaming**: Nginx `proxy_buffering off` for real-time notifications
- **Click dedup**: 1h/IP via ClickLog composite index
- **Reactions**: 6 types (LIKE, LOVE, HAHA, WOW, SAD, ANGRY) with atomic counter
- **Admin bootstrap**: ADMIN_BOOTSTRAP_USERNAME env var, idempotent, no self-promotion UI
- **Block + Ban**:
  - **Block**: User A blocks User B → B's posts hidden from A's feed, B can't interact with A's posts, B's profile 404 to A
  - **Ban**: Admin bans User → User.bannedAt set, tokenVersion bumped (kills all sessions), User profile 404 public
- **Moderation**: Reports with status (PENDING, RESOLVED, DISMISSED); admin can delete posts/comments or ban users
- **Realtime**: SSE (Nginx no-buffer) + Socket.io (Redis adapter for multi-instance)
- **Caching**: Redis 512mb noeviction (cache TTL 60s, BullMQ persistent, Socket.io adapter)
- **Metrics**: Prometheus at `/metrics` (private IPs via Nginx), Grafana dashboards

## Troubleshooting

**Logout after deploy?** → JWT_SECRET changed; clear cookies and re-login. Or bootstrap a new admin via ADMIN_BOOTSTRAP_USERNAME.

**Clicks not tracked?** → Check `trust proxy` in main.ts and Nginx proxy hops.

**SSE stuck?** → Verify `proxy_buffering off` in Nginx for `/api/notifications/stream`.

**Search broken?** → Meilisearch down; falls back to PostgreSQL FTS automatically.

**Out of Redis memory?** → Check cache TTL (60s default) and BullMQ queue sizes; increase maxmemory if needed.

See [docs/deployment-guide.md#troubleshooting](docs/deployment-guide.md#troubleshooting) for more.

## License

MIT
