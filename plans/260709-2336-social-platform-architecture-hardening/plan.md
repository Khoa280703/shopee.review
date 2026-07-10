---
title: 'Social Platform Architecture Hardening'
description: >-
  Remediate the 2026-07-09 full-codebase architecture review: fix verified
  Critical/High defects and harden the stack for a real social platform
  (100k+ users, multi-instance-ready).
status: planned
priority: P0
branch: master
tags:
  - architecture
  - scalability
  - security
  - correctness
created: '2026-07-09T16:36:00.000Z'
source: ck-code-review (codebase, 4 parallel reviewers)
---

# Social Platform Architecture Hardening

## Overview

Source: consolidated architecture review 2026-07-09 — `plans/reports/orchestrator-synthesis-260709-2336-architecture-review-consolidated-report.md` + 4 reviewer reports. Overall readiness ~6/10 for a 100k-user social trajectory. Foundation is sound (atomic counters, parameterized SQL, correct MV/queue/pgBouncer, React-escaped XSS, 7-phase hardening intact). This plan closes the verified defects and scale gaps.

All 4 Critical findings were orchestrator-verified by reading source. One reviewer "SSRF" finding was **rejected** (wrong file cited, no network fetch present); the real scraper SSRF surface is re-scoped into Phase 2 as a verification task.

## User Decisions (locked 2026-07-09 — do not reverse silently)

- **Scope now:** produce full plan only, NO code yet. Implementation gated on user approval per phase.
- **Instance topology:** unknown / not yet in prod → **design for multi-instance correctness from day one** (Redis-backed throttler, instance-agnostic cache keys). No in-memory-only shortcuts.
- **Auth/verify gate — DECIDED 2026-07-10:** the "must log in to interact" baseline the user wants is ALREADY fully implemented (every write is JwtAuthGuard-protected; guests read-only). Email-verify stays gating post-create only (`posts.service.ts:259`) — already stricter than FB/Twitter/IG. Do NOT add verify-gating to comment/react/follow (unnecessary friction; no major MXH does). Anti-bot via global throttler, not verify gates. See Phase 2 §2f.
- **Config fix for build-time bake:** use **relative `/api`** base (nginx same-origin) — one image runs every env; do NOT reintroduce absolute `NEXT_PUBLIC_API_URL`.
- **Counters:** keep atomic increment/decrement — NO sharded counters (verified unnecessary at this scale).
- **PK strategy:** BIGINT for high-growth log tables — NOT UUID.

## Phases

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| 1 | [P0 Critical Hotfixes](./phase-01-p0-critical-hotfixes.md) | P0 | ✅ Completed (2026-07-10) |
| 2 | [P1 Correctness & Resilience](./phase-02-p1-correctness-resilience.md) | P1 | 🟡 Partial (2026-07-10) |
| 3 | [P2 Scale Hardening](./phase-03-p2-scale-hardening.md) | P2 | Planned |
| 4 | [P3 Platform Features](./phase-04-p3-platform-features.md) | P3 | Planned |

### Phase 2 item status (2026-07-10)

| Item | Status | Note |
|------|--------|------|
| 2a stable cursor sort + indexes | ✅ done + migration | latent bug (FE never sends sortBy) |
| 2c cache fail-safe | ✅ done | try/catch → DB on Redis error |
| 2j scraper SSRF guard | ✅ done + tests | was mis-rejected earlier — CONFIRMED real, now fixed |
| 2k notification fire-and-forget | ✅ done | best-effort, never fails parent |
| 2h redact tokens from URL logs | ✅ done | |
| 2f auth/verify gate | ✅ no-op | login-gate already complete; decision recorded |
| 2g OAuth stateless nonce | ✅ done | double-submit state cookie, no express-session |
| 2i upload EXIF strip + cap | ✅ done + tests | sharp re-encode; GIF passthrough; sharp added to backend deps |
| 2b Redis throttler storage | ⏸ deferred (YAGNI) | single-node now + nginx per-IP limits externally; a custom node-redis ThrottlerStorage (security-sensitive) or a new ioredis dep isn't justified until actually multi-instance. Revisit at horizontal scale. |
| 2d search unify (drop ILIKE) | ⏸ deferred (contract risk) | changes findAll `{data,nextCursor}` contract + FE consumer; primary search UX already uses Meili/FTS via /search. Secondary path — do with a paired FE change, not in a long autonomous run. |
| 2e tag-based revalidation | ⏸ deferred (low value) | feed is already no-store (Phase 1e); tag invalidation is an optimization, not a correctness fix. |

## Dependency Order

- Phase 1 first — cheap, high-value, each item independently shippable; no schema change.
- Phase 2 after 1 — includes one migration (index for cursor sort) + Redis throttler; depends on P0 throttler guard existing.
- Phase 3 after 2 — migrations (BIGINT PKs, partitioning, MV recreate, User soft-delete) — riskiest DB work, do when P0/P1 stable.
- Phase 4 last — net-new features (session mgmt, 2FA, audit log, feed fanout, SEO), each independent.

## Acceptance Criteria (top-level)

- [ ] All 4 verified Critical closed with regression tests.
- [ ] `pnpm build` + `pnpm --filter @app/backend test` green; typecheck clean both apps.
- [ ] No unauthenticated endpoint accepts unbounded `limit`/`cursor`.
- [ ] Deploy with `JWT_SECRET` unset → stack refuses to boot (fail-closed).
- [ ] One frontend image boots correctly on any host/port (relative `/api`).
- [ ] All mutating endpoints rate-limited; limits hold across instances (Redis storage).
- [ ] Cursor pagination stable under every `sortBy` (no skip/duplicate) — proven by test.
- [ ] Feed never serves cached-empty after data exists.
- [ ] CI fails if a frontend image bakes an absolute localhost API URL.

## Non-Goals

- No sharded counters, no CQRS, no microservice split — YAGNI at this scale.
- No video/clips pipeline (separate initiative if roadmapped).
- No premature feed fanout-on-write for ALL users — only active-user path in Phase 4, gated on measured pain.

## Validation Log

### Session — 2026-07-09 (2 adversarial validators: fact-check + scope/solution)
- **16/18 findings CONFIRMED** against source; SSRF rejection upheld (parser has no fetch/goto).
- **Corrections applied to phases:**
  - §1c relative `/api`: added `next.config` rewrite so `pnpm dev` (no nginx) still works; `socket.ts:8` also uses `NEXT_PUBLIC_API_URL` → migrate to same-origin; Dockerfile:14 confirmed as bug source.
  - §1e stale-empty: root cause is ALSO the backend `cached()` helper (`posts.service.ts findExplore/getTrending` cache empty 60s), not only Next — "never cache empty" guard moved into the backend helper.
  - §2c: DROPPED "second Redis for cache" as OVER-ENGINEERING — single Redis already sets `ttl:60000` on every key (`app.module.ts:62-77`); keep only the try/catch fall-through + a memory alert.
  - §2g OAuth `state`: backend has NO `express-session` → `passport state:true` would throw; changed to **stateless signed-nonce cookie**.
  - §2a cursor: committed to ONE approach (compound `orderBy [{sortBy},{id}]` + composite index + raw keyset tuple; Prisma `cursor:{id}` cannot express a non-unique tuple).
  - §3a+§3b ordering: fold BIGINT id INTO the partitioned-table creation for `click_logs` (one table-swap, not two heavy rewrites).
  - **NEW finding added to Phase 2 (§2k):** `notifications.create` awaited AFTER transaction commit (`social.service.ts:67` follow, `:401` comment; `notifications.service.ts:157` no try/catch) → throw returns 500 to client even though follow/comment already committed. Fix: fire-and-forget `void` (match `posts.service.create` pattern).
- **Corrected descriptions (finding real, list wrong):** H5 — throttle IS already on auth/reports/posts-me/share; genuinely unthrottled = comments, follows, bookmarks, uploads, reaction-PUT. Global guard fix unchanged.
- **Unresolved contradictions:** 0.

## Unresolved Questions

1. Prod instance count (affects whether Phase 2 Redis throttler is urgent or precautionary — currently building it precautionarily).
1b. RESOLVED — `sortBy` is NOT used anywhere in frontend; `GET /posts` only ever called with default `createdAt` sort (load-more + sitemap). C2 is a REAL but LATENT defect (only reachable via direct API `?sortBy=likeCount&cursor=`), not user-facing today. Keep the fix in Phase 2 but downgrade urgency (not a P0 emergency). Note: `?search=` ILIKE (H8) IS live via load-more → prioritize H8 over C2 in practice.
1c. RESOLVED — `click_logs` dedup window = 1h (`tracker.service.ts:5 DEDUP_WINDOW_MS`). Monthly partition is safe (1h ≪ 1 month; dedup lookup index unaffected).
2. RESOLVED 2026-07-10 — login-gate already complete; email-verify stays post-create-only; no new verify guard (Phase 2 §2f).
3. Account-deletion/GDPR timeline — drives Phase 3 User soft-delete priority.
4. Backend port 3066 exposure in prod — drives whether `/metrics` needs an app-level guard (Phase 3).
5. Video/clips on roadmap — would reshape upload/storage architecture.
