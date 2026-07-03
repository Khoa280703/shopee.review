---
title: 'Security Fixes, Hardening & Social Upgrade'
description: >-
  Fix P0/P1 security + infra issues from architecture review; add full
  moderation and social engagement features
status: completed
priority: P1
branch: master
tags:
  - security
  - infra
  - moderation
  - social
blockedBy: []
blocks: []
created: '2026-07-02T15:38:15.229Z'
createdBy: 'ck:plan'
source: skill
---

# Security Fixes, Hardening & Social Upgrade

## Overview

Source: full-codebase architecture review, 2026-07-02. P0-1 (uploads source excluded by `.gitignore`) already resolved — user re-pushed the module; reviewed OK (magic-byte sniffing, JWT guard, R2 graceful degradation).

Three remaining work groups:
1. **Security/correctness fixes** (P0-P1): open redirect via `/r/:postId`, CORS `startsWith` bypass, SSE broken behind nginx, Redis eviction can drop BullMQ jobs, scrape crashes when `SHOPEE_AFFILIATE_ID` unset, no JWT revocation, `/metrics` publicly exposed.
2. **Perf/DB** (P2): explore query full-scan, missing composite index for click dedup, notifications not paginated.
3. **Features** (user-approved): FULL moderation (report + admin + block + ban), social engagement (reactions, bookmark/save, share) — NO star rating.

## User Decisions (locked 2026-07-02 — do not reverse silently)

- Missing `SHOPEE_AFFILIATE_ID` → **degrade**: return original product link, never throw.
- Moderation: **full scope** — report, admin role, delete, block user, ban account.
- NO star rating; social-network model instead: **reactions, share, save/bookmark**.
- Open-redirect fix (validate session): **keep the user's own affiliateUrl** (commission is the point) — validate the redirect DESTINATION (`origin_link`) is Shopee, do NOT swap in a platform link.
- Reactions: **6 Facebook-style** (LIKE, LOVE, HAHA, WOW, SAD, ANGRY).
- Legacy JWT: **force one-time global `tokenVersion` bump on release** (all users re-login once; window closed).
- Rollout: **sequential phases 1→7**.
- First admin (Phase 5): **env-driven bootstrap** via `ADMIN_BOOTSTRAP_USERNAME` (idempotent on startup), not manual SQL.
- `/metrics` (Phase 2): **keep nginx location, restrict by IP** (private ranges + `deny all`), do not delete — preserves the working scrape path, blocks public.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [P0 Security Hotfixes](./phase-01-p0-security-hotfixes.md) | Completed |
| 2 | [Infra & Config Hardening](./phase-02-infra-config-hardening.md) | Completed |
| 3 | [Auth Session Hardening](./phase-03-auth-session-hardening.md) | Completed |
| 4 | [DB & Performance](./phase-04-db-performance.md) | Completed |
| 5 | [Moderation System](./phase-05-moderation-system.md) | Completed |
| 6 | [Social Engagement Features](./phase-06-social-engagement-features.md) | Completed |
| 7 | [Docs & CI](./phase-07-docs-ci.md) | Completed |

## Dependency Order

- Phases 1, 2 independent — do first, each deployable on its own.
- Phase 3 independent (includes DB migration).
- Phase 4 independent (includes DB migration).
- Phase 5 soft-depends on Phase 3 (admin checks ride on the hardened JWT strategy); parallelizable with careful migration ordering.
- Phase 6 depends on Phase 5 (schema migrations should land in order; block-filtering touches the same feed queries Phase 6 modifies).
- Phase 7 last (docs must reflect all changes).

## Acceptance Criteria (top-level)

- [ ] `pnpm build` + `pnpm --filter @app/backend test` fully pass.
- [ ] `/r/:postId` only redirects to whitelisted Shopee hosts.
- [ ] CORS accepts exact-match origins only.
- [ ] SSE notifications work through nginx (verify via curl on port 8081).
- [ ] BullMQ jobs can never be evicted by Redis (noeviction policy on queue Redis).
- [ ] Scrape works without `SHOPEE_AFFILIATE_ID` set.
- [ ] Password change/reset invalidates old sessions.
- [ ] Users can report posts/comments/users; admin can ban/unban + delete content; block works end-to-end.
- [ ] Reactions (6 types), bookmark, share work end-to-end with correct counters.
- [ ] `./docs` reflects the current architecture; CI runs typecheck + test + build.

## Red Team Review

### Session — 2026-07-02
**Reviewers:** 4 hostile lenses (Security Adversary ran twice via harness re-run) — Fact Checker, Flow Tracer, Scope Auditor, Contract Verifier.
**Findings:** 20 distinct after dedup; all passed the evidence filter (every finding cited file:line). All accepted (folded into phases).
**Severity:** 4 Critical, 9 High, 7 Medium.

| # | Finding | Severity | Applied To |
|---|---------|----------|------------|
| 1 | Open redirect laundered via `s.shopee.vn/an_redir?origin_link=` — host whitelist insufficient | Critical | Completed |
| 2 | `reconciliation.service.ts` hard-codes `FROM likes` → nightly cron dies silently after rename | Critical | Completed |
| 3 | Missing `app.set('trust proxy')` → `req.ip`=nginx → throttle + click dedup broken | Critical | Completed |
| 4 | CI "no DB needed" contradicts Phase 5/6 DB-dependent success criteria | Critical | Completed |
| 5 | Socket.io gateway bypasses JwtStrategy → ban/revocation miss WebSocket | High | Completed |
| 6 | `sanitize()`/`omit` are denylists → new User fields (tokenVersion, bannedAt, resetToken) leak via `/auth/me` | High | Completed |
| 7 | FollowButton fix broken by `initialData`+`staleTime:Infinity` → queryFn never runs | High | Completed |
| 8 | `reactionCounts` JSON = lost-update race + YAGNI → drop it, aggregate on read | High | Phase 6 |
| 9 | `/saved` needs BOTH `PROTECTED` and `config.matcher` or route is unguarded | High | Phase 6 |
| 10 | Removing nginx `/metrics` may kill Prometheus (separate compose project, no shared net) | High | Phase 2 |
| 11 | Block is porous (read via direct URL/reaction/bookmark not guarded) → false safety | High | Phase 5 |
| 12 | Dual socket event + REST alias "for mobile" — no mobile client exists → cut | High | Phase 6 |
| 13 | `GET /posts/:id/likes/count` consumer (`like-button.tsx`) missed in migration file list | High | Phase 6 |
| 14 | `skipOwnershipCheck` boolean trap on delete → IDOR risk → separate admin methods | Medium | Phase 5 |
| 15 | likes→reactions rename leaves PK/FK/index names → Prisma drift | Medium | Phase 6 |
| 16 | Redis noeviction cutover with old AOF volume → OOM; also 2-container split is over-eng | Medium | Phase 2 |
| 17 | Legacy dirty affiliateUrl → hard 400 kills revenue; tracker increments before validate | Medium | Phase 1 |
| 18 | resend-verification email-bomb: no per-email throttle; regenerates valid token | Medium | Phase 3 |
| 19 | Report target validation = enumeration oracle (existence leak) | Medium | Phase 5 |
| 20 | "Password change invalidates sessions" criterion references non-existent endpoint | Medium | Phase 3 |

Also corrected (non-severity): notification "both consumers"→1 (Phase 4); `parseAllowedOrigins` helper dropped as YAGNI (Phase 1); nginx longest-prefix (not order) for SSE location (Phase 1); enum-before-column + NULL-type check (Phase 6).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…07.
- Decision deltas: reactionCounts dropped (Phase 6 schema/API/reconciliation/success all reconciled); Redis single-instance (Phase 2 files/steps/success reconciled, no REDIS_CACHE_URL left); no-alias reactions (Phase 6 steps reconciled); change-password added (Phase 3 files/success reconciled).
- Reconciled stale references: 6 (removed "deprecated aliases", "both event names", "reconciliation extension", "reactionCounts", "redis-cache", "both consumers").
- Unresolved contradictions: 0.

## Validation Log

### Session — 2026-07-02
- **Open-redirect fix** (Phase 1): keep user's affiliateUrl for commission; validate `origin_link` destination is Shopee. Phase 1a rewritten; productUrl-swap approach rejected.
- **Legacy JWT** (Phase 3): force one-time global `tokenVersion` bump on release. Phase 3a updated.
- **Reactions** (Phase 6): 6 Facebook-style confirmed. Phase 6 requirements updated.
- **Rollout**: sequential 1→7 (task dependencies already reflect this).

#### Whole-Plan Consistency Sweep (post-validation)
- Files reread: plan.md, phase-01, phase-03, phase-06.
- Decision deltas: affiliate-keep (Phase 1a/success/files reconciled — no productUrl-swap left), global-bump (Phase 3a), 6-reactions (Phase 6 req).
- Unresolved contradictions: 0.

## Unresolved Questions

- None. (First admin → env `ADMIN_BOOTSTRAP_USERNAME`; `/metrics` → nginx IP allow-list. Both decided 2026-07-02.)
- Cook-time verification only (not decisions): confirm Prometheus target stays UP after the `/metrics` allow-list change.
