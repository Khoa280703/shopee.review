# Pre-deploy review — working tree on 983a01e (2026-10-06)

Verdict: BLOCKED until C1–C4 fixed. App logic (soft delete, suspend/ban, email normalize, OAuth link) mostly correct.

## Critical
- C1 Backend crash-loop as non-root: `apps/backend/Dockerfile` CMD uses `pnpm exec prisma` → corepack re-downloads into unwritable `/app/.cache` (EACCES reproduced). Fix: call `./node_modules/.bin/prisma` directly or set `COREPACK_HOME` readable; boot-test the container.
- C2 Role rotation runbook wrong: on live DB all tables/sequences/MV/schema `public` are owned by `shopee_review`; `ALTER DATABASE OWNER` doesn't move object ownership → app role gets permission denied, migrations fail.
- C3 Live `.env` lacks `POSTGRES_PASSWORD` → every compose command fails with `:?`.
- C4 `openssl rand -base64` passwords break `DATABASE_URL` (`/ + =`); use `openssl rand -hex 32`.

## High
- H1 Open redirect via `?next=` / `authReturnTo` (`/\evil.com`, `/\t/evil.com`) in `app/auth/{login,register,callback}/page.tsx`. Fix: shared `safeNext` with URL origin check.
- H2 nginx `limit_req` keyed on Traefik IP (no `set_real_ip_from`) → whole site shares 5 r/m on `/api/auth/`. Coolify network CIDR: `10.0.1.0/24`.

## Medium
- M1 comment soft-delete/restore counter race (`social.service.ts` ~429-481) → conditional `updateMany` on `deletedAt`.
- M2 deleted parent comment hides replies but counter still counts them.
- M3 bumped LIKE/FOLLOW notification sorted by `id` → appears deep in list.
- M4 no admin UI to unsuspend/unban, no confirm; auto-resolve removes the way back.
- M5 OAuth callback 400/403 rendered as raw JSON.
- M6 Playwright browser install not pinned to lockfile version.

## Low
L1 profile post count includes soft-deleted · L2 Meili reindex includes deleted/banned · L3 cache delays (documented) · L4 partial indexes leave FK lookups unindexed · L5 global statement_timeout affects migrations · L6 HSTS not inherited in locations with own add_header · L7 `cookies()` makes SSR dynamic · L8 stale tabs get 400 on bookmark · L9 orphan certbot (use `--remove-orphans`).

## Verified OK
Migrations safe on live data (0 email collisions, 0 dup notifications); partial indexes match Prisma queries; auth checks in `validateUser` + `JwtStrategy`; API contracts match frontend; socket refcount correct.
