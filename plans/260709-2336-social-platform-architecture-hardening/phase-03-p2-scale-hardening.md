---
phase: 3
title: P2 Scale Hardening
status: planned
priority: P2
dependencies: [2]
effort: 2 days
---

# Phase 3: P2 Scale Hardening

## Overview

Structural changes that are cheap NOW and expensive LATER. Mostly DB migrations + ops. Do when P0/P1 are stable. Riskiest DB work in the plan — snapshot backup + verify on a copy first.

## Items

### 3a+3b. BIGINT PKs + retention/partitioning (COMBINED — validated ordering)
Validation: partitioning `click_logs` needs a table-swap anyway, so do BIGINT id IN the same swap — one heavy rewrite, not two.

- **`click_logs`** (Int4 id confirmed `schema.prisma:185`, no inbound FK; PII: IP/UA/referer):
  - Dedup window CONFIRMED = 1h (`tracker.service.ts:5 DEDUP_WINDOW_MS`). Monthly range partition is safe (1h ≪ 1 month; dedup lookup index unaffected).
  - Create a NEW partitioned table (range by `created_at`) with `id BIGINT` from the start → copy data → rename-swap. Retention cron drops partitions older than N days (privacy win: PII auto-expires).
- **`notifications`** (Int4 id confirmed `schema.prisma:202`, no inbound FK):
  - `ALTER COLUMN id TYPE BIGINT` (cheap — no FK). Retention cron deleting READ notifications older than N days (partition only if volume warrants). Ensure index supports per-recipient `ORDER BY id DESC`.
- Keep other PKs Int4 (fine at scale). **NOT UUID** (index bloat, no ordering benefit). Int4 exhausts ~2.1B rows; click_logs reaches it fastest.
- Document retention windows in deployment-guide.

### 3c. Recreate trending MV with share_count
- MV was created before the `share_count` column migration → shows 0 AND drops shares from scoring (`posts.service.ts:91 ?? 0` masks it).
- Migration: `DROP MATERIALIZED VIEW ... ; CREATE ... ` including `share_count` in projection + scoring. Preserve the `REFRESH CONCURRENTLY` unique index. Verify refresh cron still works.

### 3d. User soft-delete (account deletion / GDPR path)
- Current: User delete hard-cascades (`schema.prisma:108,127,142,172,210`) → mass-delete risk + others' counters wrong up to 24h.
- Add `deletedAt` soft-delete; scrub PII (email/displayName/avatar) on deletion, retain rows for referential integrity; filter `deletedAt` in all read paths (reuse the `bannedAt` filter pattern). Provide an explicit admin/user "delete my account" flow.
- Gate priority on user's GDPR timeline (open question).

### 3e. TLS / proxy header correctness
- nginx forces `X-Forwarded-Proto: http` behind Traefik; `:8081` publish bypasses TLS.
- Fix: honor upstream `X-Forwarded-Proto` from Traefik; ensure Secure cookies + redirects use the real scheme in prod. Keep `:8081` for local only (don't publish in prod compose).

### 3f. CI image-build gate (would have caught today's port-80 bug)
- `.github/workflows/ci.yml`: add a job that builds the frontend docker image WITHOUT passing build args, then greps the bundle for `http://localhost` / absolute API URLs → fail if present. After Phase 1c (relative `/api`), this asserts the fix stays.
- Add frontend typecheck/lint to CI if missing; consider a minimal Playwright smoke (login + feed render) against the composed stack.

### 3g. Reaction optimistic-update guard
- `components/social/reaction-button.tsx`: rapid taps race (no optimistic state, out-of-order responses). Add pending-guard + optimistic update with rollback on error; ignore stale responses (request id / abort previous).

## Related Code Files

- Modify: `packages/database/prisma/schema.prisma` + migrations (BIGINT, partitioning, MV recreate, User.deletedAt)
- Create: retention cron in `apps/backend/src/maintenance/`
- Modify: `apps/backend/src/users/*` (soft-delete filters), `posts.service.ts` (MV projection), `nginx/*`, `.github/workflows/ci.yml`, `apps/frontend/src/components/social/reaction-button.tsx`

## Success Criteria

- [ ] `click_logs.id`/`notifications.id` are BIGINT; app unaffected.
- [ ] Old `click_logs` partition dropped by cron; PII gone.
- [ ] Trending shows real `share_count` and shares affect ranking.
- [ ] Deleting a user scrubs PII, keeps counters correct, no cascade wipe.
- [ ] Prod requests see correct scheme; Secure cookies work behind Traefik.
- [ ] CI fails a deliberately mis-baked frontend image.
- [ ] Rapid reaction toggling converges to correct final state.

## Risk / Rollback

- BIGINT + partition migrations are heavy — test on a DB copy, snapshot first, run in a maintenance window; partitioning existing `click_logs` may need a table swap (create partitioned + copy + rename).
- MV drop/recreate briefly empties trending until first refresh — schedule refresh immediately after.
- Soft-delete touches every User read path — audit exhaustively (reuse bannedAt filter sites as the checklist).
