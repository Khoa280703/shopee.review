---
phase: 7
title: Docs & CI
status: completed
priority: P2
dependencies:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
effort: 0.5 day
---

# Phase 7: Docs & CI

## Overview

Rewrite stale docs that still describe the pre-pivot "deal aggregator + admin panel" app, and add a GitHub Actions CI pipeline (typecheck + test + build).

## Requirements

- Functional: docs describe the CURRENT social-review platform incl. this plan's changes; CI blocks broken PRs/pushes.
- Non-functional: each doc ≤800 LOC (docs.maxLoc); no invented content — everything verified against code.

## Architecture

### 7a. Docs rewrite

Stale files (verified 2026-07-02):
- `docs/system-architecture.md` — still `/admin/deals`, `/api/deals` flows. Rewrite: monorepo services map (backend NestJS modules incl. moderation, frontend Next.js, Postgres+pgBouncer, Redis×2, Meilisearch, nginx, monitoring stack), data flows (post creation + scrape queue, click tracking, SSE/socket.io realtime, block/ban), deploy topology (Coolify/Traefik → nginx → apps).
- `docs/deployment-guide.md` — top half references `ADMIN_PASSWORD`, `UPLOAD_DIR`, port 3001, `/api/deals` smoke tests. Rewrite around docker-compose stack + env table (keep the good R2/Sentry sections), add redis-cache + SHOPEE_AFFILIATE_ID + ADMIN first-user setup.
- `docs/development-roadmap.md` — pre-pivot MVP content. Rewrite: shipped phases (pivot, design system, production readiness, optimization, this plan), next candidates.
- `docs/project-changelog.md` — append entries for this plan's phases.
- `README.md` — update feature list (reactions/bookmark/share/moderation), env vars (REDIS_CACHE_URL), remove stale claims ("Realtime: SSE" → SSE + Socket.io).

### 7b. CI (GitHub Actions)

`.github/workflows/ci.yml`:
- Trigger: push to master + PRs.
- Job matrix not needed (single Node 20). Steps: pnpm setup (corepack, cache via `actions/setup-node` pnpm cache), `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm --filter @app/backend typecheck`, `pnpm --filter @app/frontend typecheck`, `pnpm --filter @app/backend test`, `pnpm build` (turbo builds all).
- **[RED TEAM — CRITICAL] Phase 5/6 success criteria REQUIRE a real DB** (migration row counts, cascade correctness, P2002 idempotency, "row counts equal post-migration", parallel-reaction no-lost-update). The original "no Postgres container needed" claim contradicts them. Resolution: split test tiers — `test:unit` (mock Prisma, current specs) runs everywhere; `test:integration` (real DB) runs in a CI job with a `postgres:16-alpine` service + `prisma migrate deploy` + seed. Phase 5/6 DB-dependent criteria live in the integration tier, NOT mocked (a mock cannot prove counter math or migration correctness). Update the two specs' strategy accordingly.
- Playwright chromium NOT installed in CI (scraper tests must mock; verify existing spec doesn't launch browsers).
- CI jobs: `lint/typecheck` + `test:unit` + `build` (no DB) run on all PRs; `test:integration` (Postgres service) runs on PRs touching backend/migrations.

## Related Code Files

- Modify: `docs/system-architecture.md`, `docs/deployment-guide.md`, `docs/development-roadmap.md`, `docs/project-changelog.md`, `README.md`
- Create: `.github/workflows/ci.yml`

## Implementation Steps

1. Re-read each doc fully; rewrite against actual code (post-phases 1-6 state).
2. Write ci.yml; run locally-equivalent commands to confirm they pass before committing.
3. Push a test branch to confirm CI green.

## Success Criteria

- [ ] No doc references deals/admin-panel-era endpoints, `ADMIN_PASSWORD`, `UPLOAD_DIR`, or port 3001.
- [ ] `docs/system-architecture.md` module map matches `app.module.ts` imports 1:1 (incl. moderation module).
- [ ] CI unit+build job green with NO Postgres; integration job green WITH Postgres service running migrations.
- [ ] CI red when a type error is introduced (spot-check); integration job red when a counter-math test fails.

## Risk Assessment

- Docs drift again without process — changelog discipline noted in CLAUDE.md workflows already; out of scope to enforce here.
- CI build step needs NEXT_PUBLIC_* args? `next build` works with defaults (localhost fallbacks in constants.ts) — verify, else pass dummy envs in workflow.
