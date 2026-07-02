---
title: "Production Readiness Fixes — Shopee Review Social Platform"
description: "P0-P2 fixes: SQL trending, follow race, indexes, error filter, Next Image, comment N+1, caching, live comments, infra"
status: completed
priority: P1
effort: 14h
branch: master
tags: [backend, frontend, performance, nestjs, nextjs, prisma]
created: 2026-06-25
---

# Production Readiness Fixes

Audit-driven fixes for the MXH review Shopee platform. Ordered P0 → P2.

## Scope Corrections (verified against current code)

Audit was written against an earlier state. Verified deltas before planning:

- **findExplore already uses SQL** with score formula + offset pagination (`posts.service.ts:73`). Only `getTrending()` (line 149) still sorts in-memory — narrower than audit implied.
- **Indexes partially exist**: `Comment` has separate `@@index([parentId])` and `@@index([postId])`; needs **composite** `[postId, parentId]`. `Follow` has `@@index([followingId])`; needs `[followerId]`.
- **R2 service already degrades gracefully** (`r2-upload.service.ts` returns 500 with clear message when unconfigured). "Upload fails silently" is inaccurate — it fails loudly. Phase 6 is an **ops/config** task (populate `.env`), not a code fix.
- **7 files** use raw `<img>`, not 1: post-feed-card, post-card, image-carousel, avatar, image-uploader, right-sidebar, `[postId]/page.tsx`. next.config already has R2 + Shopee remote patterns.

## Phases

| # | Phase | Priority | Effort | Status |
|---|-------|----------|--------|--------|
| 1 | [Backend P0 — SQL trending, follow race, indexes, error filter](phase-01-backend-p0-fixes.md) | P0 | 3h | completed |
| 2 | [Frontend P1 — `<img>` → Next `<Image>` migration](phase-02-frontend-image-migration.md) | P1 | 3h | completed |
| 3 | [Backend P1 — comment N+1 + reply pagination](phase-03-backend-comments-n1.md) | P1 | 2h | completed |
| 4 | [Performance P2 — cache trending + explore (CacheModule, Redis-optional)](phase-04-cache-layer.md) | P2 | 2h | completed |
| 5 | [UX P2 — live comments auto-polling](phase-05-live-comments-polling.md) | P2 | 2h | completed |
| 6 | [Infra P2 — R2 config + Sentry setup](phase-06-infra-r2-sentry.md) | P2 | 2h | completed |

## Key Dependencies

- Phase 1 must land first (touches schema + service + bootstrap). Migration required.
- Phase 3 depends on Phase 1's composite `Comment[postId, parentId]` index for efficient reply queries.
- Phase 4 wraps Phase 1's `getTrending` + existing `findExplore` — do after Phase 1.
- Phases 2, 5, 6 are independent of each other; can run parallel after Phase 1.

## Guiding Principles

- **YAGNI/KISS**: No Redis hard dependency. No GraphQL. No websockets — polling for live comments.
- **DRY**: One shared error filter, one cache TTL constant per concern.
- Each phase ends with a compile check (`pnpm --filter <app> build` or `tsc --noEmit`).

## Validation Per Phase

Backend: `pnpm --filter @app/backend build` + targeted `psql EXPLAIN` for index usage.
Frontend: `pnpm --filter frontend build` (catches Image/lint errors).
