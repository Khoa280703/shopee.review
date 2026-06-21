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

## Verification

```bash
curl -I https://shopee.review
curl https://shopee.review/api/health
curl https://shopee.review/api/deals
```

Verify full flow: login `/admin/login` -> scrape/manual fallback -> upload image -> create deal -> public view -> affiliate click.
