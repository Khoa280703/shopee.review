---
title: "Phase 5 — PostgreSQL Materialized Views + pg_cron (Trending)"
phase: 5
group: D
priority: P2
status: completed
effort: 8h
depends_on: []
blocks: []
created: 2026-06-25
---

# Phase 5 — Materialized Views + pg_cron

## Context Links
- Research: `research/researcher-02-frontend-infra.md` (Section 5: MV, REFRESH CONCURRENTLY, pg_cron, Prisma queryRaw)
- Scout: `posts.service.ts` has `queryTrending()` + `cached()` helper; `schema.prisma` Post has denormalized `likeCount/commentCount/clickCount`.

## Overview
- **Priority:** P2 (independent — run anytime)
- **Status:** completed (refresh via @nestjs/schedule; pg_cron documented as prod alt)
- Precompute trending into `trending_posts_mv`, refreshed every 5 min via pg_cron `REFRESH CONCURRENTLY`. `queryTrending()` reads the view instead of aggregating live.

## Key Insights
- Denormalized counts already on Post → formula reads columns directly, no JOIN aggregation needed (fast MV).
- Score: `(click_count*0.4 + like_count*0.3 + comment_count*0.3) * exp(-age_hours/24)`.
- `REFRESH CONCURRENTLY` requires a UNIQUE index on the MV (no readers blocked).
- pg_cron must be installed in the Postgres image and added to `shared_preload_libraries`.
- Migration must run via DIRECT_URL (port 5432, Phase 1) — pg_cron/extensions not poolable through pgBouncer.

## Requirements
**Functional**
- `trending_posts_mv` exists with id, post fields, computed `score`.
- Refreshed concurrently every 5 minutes.
- `queryTrending(limit, cursor)` returns rows ordered by `score DESC, id DESC`.

**Non-functional**
- Unique index `(score DESC, id DESC)` — actually unique index on `id` plus a separate sort index (UNIQUE must be on a truly unique column for CONCURRENTLY).
- Refresh completes well under 5 min for current dataset.

## Architecture
```
posts/likes/comments (denormalized counts) --> MV trending_posts_mv (score computed)
pg_cron: */5 * * * * REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv
PostsService.queryTrending() --$queryRaw--> SELECT ... FROM trending_posts_mv ORDER BY score DESC, id DESC
```

## Related Code Files
**Create**
- `packages/database/prisma/migrations/XXXXXX_trending_mv/migration.sql` — extension, MV, indexes, cron.sql.

**Modify**
- `apps/backend/src/posts/posts.service.ts` — `queryTrending()` switches to `$queryRaw` against the MV (coordinate with P2 which edits scraper methods in same file; distinct methods — sequence).
- (optional) `packages/database/prisma/schema.prisma` — add `TrendingPostsMv` view model for typed reads.

## Implementation Steps
1. Confirm Postgres image supports pg_cron (use `postgres:16` + install, or an image bundling pg_cron). Add `shared_preload_libraries='pg_cron'` and `cron.database_name` (coordinate docker-compose with P1 — P1 owns base; document required Postgres config change).
2. Author migration SQL:
   - `CREATE EXTENSION IF NOT EXISTS pg_cron;`
   - `CREATE MATERIALIZED VIEW trending_posts_mv AS SELECT p.id, p.title, p.user_id, p.category_id, p.created_at, p.like_count, p.comment_count, p.click_count, (p.click_count*0.4 + p.like_count*0.3 + p.comment_count*0.3) * exp(- (EXTRACT(EPOCH FROM (NOW()-p.created_at))/3600.0) / 24.0) AS score FROM "Post" p WHERE p.status='published' AND p.created_at > NOW() - INTERVAL '30 days';` (adjust table/column names to actual schema).
   - `CREATE UNIQUE INDEX trending_posts_mv_id_uidx ON trending_posts_mv (id);` (required for CONCURRENTLY).
   - `CREATE INDEX trending_posts_mv_score_idx ON trending_posts_mv (score DESC, id DESC);`
   - `SELECT cron.schedule('refresh_trending', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv');`
3. Run migration via DIRECT_URL.
4. (Optional) add `TrendingPostsMv` model in schema with `@@map("trending_posts_mv")` for typed `$queryRaw`.
5. Update `queryTrending()` to `$queryRaw` from MV, keyset pagination on `(score, id)`. Keep existing `cached()` wrapper (short TTL, e.g. 60s) on top.
6. Verify `SELECT * FROM cron.job;` shows the schedule; trigger manual `REFRESH ... CONCURRENTLY` to validate unique index.
7. Compare trending output before/after for sanity.

## Todo List
- [ ] Confirm/enable pg_cron in Postgres (shared_preload_libraries)
- [ ] Write MV migration (extension, MV, indexes)
- [ ] Schedule cron refresh */5
- [ ] Run migration via DIRECT_URL
- [ ] (Optional) TrendingPostsMv schema model
- [ ] Update queryTrending() to read MV
- [ ] Validate REFRESH CONCURRENTLY + cron.job

## Success Criteria
- `trending_posts_mv` populated; `score` matches formula.
- `cron.job` entry present; `cron.job_run_details` shows successful refreshes.
- `queryTrending()` returns view-backed results ordered by score; latency lower than live aggregation.

## Risk Assessment
- **pg_cron not in image** → requires Postgres image change + restart; coordinate with P1 (base docker-compose). Fallback: `@nestjs/schedule` cron calling raw REFRESH if pg_cron unavailable.
- **posts.service.ts shared with P2** → P5 edits only `queryTrending()`; sequence after/around P2 scraper edits.
- **Column name mismatch** → verify actual Post table/column casing in schema before writing SQL.
- **CONCURRENTLY needs unique index** → ensure unique index on `id` exists before scheduling.

## Security Considerations
- MV exposes only public published posts (WHERE status='published').
- pg_cron runs as DB superuser context — restrict who can edit schedules.

## Next Steps
- Independent; trending endpoint now cheaper, complements Phase 8 DB metrics.
