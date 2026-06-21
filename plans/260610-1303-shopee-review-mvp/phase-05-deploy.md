# Phase 5 — Coolify + Traefik + PostgreSQL Service + Cloudflare

## Context Links
- [Research: Docker Setup](../reports/researcher-02-nestjs-nextjs-setup.md)
- [Phase 1: Dev Docker](phase-01-setup-monorepo.md)
- [Phase 3: Local Uploads](phase-03-implement-backend.md)

## Overview
- **Priority**: P1
- **Status**: completed
- **Effort**: 3h
- **Mô tả**: Deploy bằng Coolify trên home server đã có Traefik + Cloudflare. PostgreSQL là service riêng. API/Web là services riêng. Upload ảnh local persist qua volume.

## Key Insights
- User đã có Traefik + Coolify + Cloudflare. Không setup Nginx, không Cloudflare Tunnel trong MVP path.
- PostgreSQL nên là Coolify Database Service riêng để backup/volume độc lập.
- API service cần persistent volume cho `uploads/`.
- Web service gọi API public qua `NEXT_PUBLIC_API_URL` và gọi internal API bằng URL service nội bộ nếu Coolify network cho phép.
- Playwright Chromium chỉ dùng fallback; image backend có thể lớn hơn nếu cài Chromium.

## Requirements
### Functional
- Coolify có 3 services: `postgres`, `api`, `web`.
- `https://shopee.review` route về web service.
- `https://shopee.review/api/*` route về api service.
- API chạy migration khi deploy.
- Uploads persist sau redeploy/restart.

### Non-functional
- PostgreSQL không expose public internet.
- API/Web restart on failure.
- Deploy rollback được qua Coolify previous deployment.
- Page load < 2s sau Cloudflare cache.

## Architecture
```
Internet
  │
  ▼
Cloudflare DNS/CDN/WAF
  │
  ▼
Traefik on home server
  ├── shopee.review/*      → web service :3000
  └── shopee.review/api/*  → api service :3001

Coolify project
  ├── PostgreSQL service
  │   └── volume: postgres data
  ├── API service
  │   ├── NestJS backend
  │   ├── Prisma migrate deploy on start
  │   └── volume: uploads:/app/uploads
  └── Web service
      └── Next.js standalone
```

## Related Code Files
### Create
- `apps/backend/Dockerfile`
- `apps/frontend/Dockerfile`
- `.dockerignore`
- `docs/deployment-guide.md` — Coolify service/env/volume checklist

### Modify
- `apps/frontend/next.config.ts` — add `output: 'standalone'`
- `.env.example` — include production env keys without real secrets

## Implementation Steps

### Step 1: Backend Dockerfile

`apps/backend/Dockerfile`:
```dockerfile
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/database ./packages/database
COPY apps/backend ./apps/backend
RUN pnpm --filter @app/database generate
RUN pnpm --filter @app/backend build

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install only if Playwright fallback remains enabled.
RUN pnpm dlx playwright install chromium --with-deps

ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/packages/database ./packages/database
RUN mkdir -p /app/uploads

EXPOSE 3001
CMD ["sh", "-c", "cd packages/database && pnpm exec prisma migrate deploy && cd /app && node apps/backend/dist/main.js"]
```

### Step 2: Frontend Dockerfile

`apps/frontend/Dockerfile`:
```dockerfile
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY tsconfig.base.json ./
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/database ./packages/database
COPY apps/frontend ./apps/frontend
RUN pnpm --filter @app/database generate
RUN pnpm --filter @app/frontend build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/frontend/.next/standalone ./
COPY --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
```

Update `apps/frontend/next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  // existing config
};
```

### Step 3: .dockerignore

`.dockerignore`:
```
node_modules
.next
dist
.git
.env
.env.*
uploads
.turbo
coverage
.vscode
plans
```

### Step 4: Coolify PostgreSQL Service

Create a **Database → PostgreSQL 16** service in Coolify:
- Service name: `shopee-review-postgres`
- Database: `shopee_review`
- User: `shopee_review`
- Password: generated strong password
- Public exposure: disabled
- Volume: Coolify-managed persistent database volume
- Backups: enable daily backup if available

Copy internal connection string into API env:
```env
DATABASE_URL=postgresql://shopee_review:<password>@<coolify-postgres-host>:5432/shopee_review
```

Use the exact internal host shown by Coolify, not `localhost`.

### Step 5: Coolify API Service

Create application service from repo:
- Build context: repo root
- Dockerfile: `apps/backend/Dockerfile`
- Port: `3001`
- Health check path: `/api/health` if implemented; otherwise Coolify TCP check for MVP
- Persistent volume: mount `uploads` to `/app/uploads`

Environment:
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...
JWT_SECRET=CHANGE_ME_MIN_32_CHARS_RANDOM
ADMIN_PASSWORD=CHANGE_ME_STRONG_ADMIN_PASSWORD
SHOPEE_AFFILIATE_ID=your-real-affiliate-id
FRONTEND_URL=https://shopee.review
UPLOAD_DIR=uploads
```

Traefik route:
- Host: `shopee.review`
- Path prefix: `/api`
- Service port: `3001`

### Step 6: Coolify Web Service

Create application service from repo:
- Build context: repo root
- Dockerfile: `apps/frontend/Dockerfile`
- Port: `3000`

Environment:
```env
NEXT_PUBLIC_API_URL=https://shopee.review/api
API_INTERNAL_URL=http://<api-service-internal-host>:3001/api
```

If internal host is uncertain, use `https://shopee.review/api` for both envs first, then optimize internal routing later.

Traefik route:
- Host: `shopee.review`
- Path prefix: `/`
- Service port: `3000`

### Step 7: Cloudflare Setup

Cloudflare remains DNS/CDN/WAF only:
- `A shopee.review -> home server public IP`, proxied.
- `A www -> home server public IP`, proxied or redirect to apex.
- SSL/TLS mode: Full strict if origin cert is configured by Traefik, otherwise Full.
- Always Use HTTPS: On.
- Brotli: On.
- Cache dynamic API conservatively. Do not cache `/api/admin/*`.

### Step 8: Deployment Verification

```bash
# From local after deploy
curl -I https://shopee.review
curl https://shopee.review/api/deals
curl -X POST https://shopee.review/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<admin-password>"}'

# Upload verification with token
curl -X POST https://shopee.review/api/admin/uploads/deal-image \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.webp"
```

Full flow:
1. Login `/admin/login`.
2. Paste Shopee URL.
3. Scrape succeeds or manual fallback opens.
4. Upload local image if needed.
5. Publish deal.
6. Public homepage shows deal in newsfeed.
7. Buy button tracks click and opens affiliate URL.

## Todo List
- [x] Create backend Dockerfile.
- [x] Create frontend Dockerfile.
- [x] Add `output: 'standalone'` to Next config.
- [x] Create `.dockerignore`.
- [x] Document Coolify PostgreSQL service with private networking.
- [x] Document Coolify API service with `uploads` volume.
- [x] Document Coolify Web service.
- [x] Document Traefik routes: `/api` → API, `/` → Web.
- [x] Document Cloudflare DNS/SSL/WAF.
- [x] Verify local migration, upload serving path, and API/frontend smoke flow.
- [x] Document exact Coolify env/volume settings in `docs/deployment-guide.md`.

## Success Criteria
- `https://shopee.review` loads web service.
- `https://shopee.review/api/deals` hits API service.
- PostgreSQL is a separate Coolify service, not bundled into app container.
- API deploy runs `prisma migrate deploy` successfully.
- Uploaded image remains accessible after API service restart/redeploy.
- `/admin/login` works; `/admin/deals` sees draft and archived deals.
- Full flow works: login → scrape/manual → upload image → create deal → public view → affiliate click.

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Coolify internal host wrong | Medium | Use Coolify-provided connection strings; fallback to public API URL for web |
| Upload volume not mounted | High | Explicit `/app/uploads` persistent volume; verify after redeploy |
| DB data loss | High | Use Coolify managed Postgres volume + daily backup |
| API route shadowed by web route | High | Traefik path priority `/api` higher than `/` |
| Playwright deps make backend image large | Medium | Keep API-first; remove Chromium later if fallback unused |

## Security Considerations
- Never commit real `.env` or Coolify secrets.
- PostgreSQL private only; no public port.
- Cloudflare WAF enabled.
- Do not cache `/api/admin/*`.
- Strong `ADMIN_PASSWORD` and `JWT_SECRET`.
- Uploads allow only JPEG/PNG/WebP and max 5MB.

## Next Steps (Post-MVP)
- `/api/health` endpoint for Coolify health checks.
- Automated DB backups retention policy.
- Image cleanup job for orphaned uploads.
- Uptime monitoring.
- CI/CD smoke test after Coolify deploy.
