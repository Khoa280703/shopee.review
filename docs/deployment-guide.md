# Deployment Guide

## Coolify Services

- `shopee-review-postgres`: PostgreSQL 16 database service, private networking only.
- `shopee-review-api`: Dockerfile `apps/backend/Dockerfile`, port `3001`, volume `/app/uploads`.
- `shopee-review-web`: Dockerfile `apps/frontend/Dockerfile`, port `3000`.

## API Environment

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://shopee_review:<password>@<coolify-postgres-host>:5432/shopee_review
JWT_SECRET=<strong-random-min-32-chars>
ADMIN_PASSWORD=<strong-admin-password>
SHOPEE_AFFILIATE_ID=<affiliate-id>
FRONTEND_URL=https://shopee.review
UPLOAD_DIR=uploads
```

## Web Environment

```env
NEXT_PUBLIC_API_URL=https://shopee.review/api
API_INTERNAL_URL=http://<api-service-internal-host>:3001/api
```

If the internal API hostname is not available yet, use `https://shopee.review/api` for both values.

## Traefik Routing

- `Host(shopee.review) && PathPrefix(/api)` -> API service port `3001`.
- `Host(shopee.review)` -> Web service port `3000`.
- Give `/api` route higher priority than `/`.

## Cloudflare

- DNS A record for `shopee.review` points to home server public IP, proxied.
- SSL mode: Full strict if Traefik origin cert exists, otherwise Full.
- Do not cache `/api/admin/*`.

## Cloudflare R2 (Image Uploads)

Image uploads are stored in Cloudflare R2 via the S3-compatible API. The backend
(`apps/backend/src/uploads/r2-upload.service.ts`) is fully env-driven: when the
R2 variables below are absent it rejects uploads with a clear 500 and logs a
warning, so the only setup required is populating these values.

### Steps

1. **Create a bucket** in the Cloudflare dashboard → R2 → *Create bucket*
   (e.g. `shopee-review-uploads`).
2. **Create an API token**: R2 → *Manage R2 API Tokens* → *Create API Token*.
   - Permission: **Object Read & Write**, scoped to the single bucket (least privilege).
   - This yields an **Access Key ID** and **Secret Access Key**.
3. **Get the Account ID**: shown on the R2 overview page (right sidebar).
4. **Enable a public URL** for the bucket: bucket → *Settings* → *Public access*.
   - Use the provided `https://pub-<hash>.r2.dev` dev URL, **or** attach a custom
     domain. If you use a **custom domain**, add its hostname to
     `images.remotePatterns` in `apps/frontend/next.config.ts`.

### Env var mapping

| Variable | Where | Notes |
|----------|-------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | API | **Required** — S3 client is null without it |
| `R2_ACCESS_KEY_ID` | API | From the API token |
| `R2_SECRET_ACCESS_KEY` | API | From the API token |
| `R2_BUCKET_NAME` | API | e.g. `shopee-review-uploads` |
| `R2_PUBLIC_URL` | API | Public/dev URL or custom domain (no trailing slash) |

The frontend's `next.config.ts` already allow-lists `**.r2.dev` and
`**.r2.cloudflarestorage.com`. Confirm `R2_PUBLIC_URL`'s host matches one of the
configured patterns (add a pattern for custom domains).

## Sentry (Error Tracking)

Both apps integrate Sentry and are **no-ops when the DSN is unset**, so local dev
and non-configured environments are unaffected.

- Backend: `@sentry/nestjs`, initialised in `apps/backend/src/instrument.ts`
  (imported first in `main.ts`). Reads `SENTRY_DSN`.
- Frontend: `@sentry/nextjs`, configured via `instrumentation.ts`,
  `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`,
  and `withSentryConfig` in `next.config.ts`. Reads `NEXT_PUBLIC_SENTRY_DSN`.

### Env vars

```env
SENTRY_DSN=<backend project dsn>
NEXT_PUBLIC_SENTRY_DSN=<frontend project dsn>
# Optional — only for uploading source maps during frontend prod builds:
SENTRY_ORG=<org-slug>
SENTRY_PROJECT=<project-slug>
SENTRY_AUTH_TOKEN=<token>
```

PII scrubbing is on by default (`sendDefaultPii: false`; cookies/auth headers
stripped in `beforeSend`).

## Verification

```bash
curl -I https://shopee.review
curl https://shopee.review/api/health
curl https://shopee.review/api/deals
```

Verify full flow: login `/admin/login` -> scrape/manual fallback -> upload image -> create deal -> public view -> affiliate click.
