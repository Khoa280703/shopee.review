# Project Changelog

## 2026-06-10

- Implemented shopee.review MVP monorepo.
- Added NestJS API with admin auth, deals CRUD, categories, scraper, local uploads, expiry scheduler, click tracking.
- Added Next.js frontend with public feed/grid, deal detail, admin login/dashboard/deal creation.
- Added Prisma PostgreSQL schema and initial migration.
- Added Dockerfiles and Coolify deployment guide.
- Fixed review issues: root `.env` loading, public DRAFT leakage, local upload rendering, Postgres array schema, scrape DTO validation.
- Verified frontend/backend Docker images build successfully.
- Added idempotent sample data seed command with categories, active deals, draft deal, and local sample images.
- Updated public deal UI: feed now follows a social newsfeed layout, grid cards keep stable heights, buy buttons align consistently, and mobile controls avoid horizontal overflow.
- Updated local development ports to frontend `5166` and backend `3066`.
- Replaced public Feed/Grid UI with Stitch design screens from project `9744743019150831028`, including Stitch assets saved under `plans/stitch-shopee-deal-hub/`.

## Unresolved Questions

- None.
