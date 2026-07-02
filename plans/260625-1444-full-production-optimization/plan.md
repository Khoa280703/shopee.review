---
title: "Full Production Optimization (MXH Review Shopee)"
description: "Parallel-execution plan: Redis, BullMQ, WebSockets, React Query, MV, Meilisearch, Nginx, monitoring."
status: completed
priority: P1
effort: 76h
branch: master
tags: [infra, performance, realtime, observability, nestjs, nextjs]
created: 2026-06-25
---

# Full Production Optimization — MXH Review Shopee

Production-grade optimization of NestJS 10 + Prisma 6 + PostgreSQL + Next.js 15 stack on a single 32-core / 256GB Docker Compose server. Parallel execution across 5 groups, 8 phases.

## Goals
- Async heavy work (email, scraping, notification fan-out) via BullMQ.
- Real-time live comments + like counts via Socket.io (Redis adapter).
- Frontend feed performance: React Query infinite scroll + optimistic updates.
- Trending feed off materialized view (pg_cron refresh) instead of live aggregation.
- Fast Vietnamese search via Meilisearch (PG FTS fallback).
- Nginx entrypoint with rate limiting, WS proxy, compression, security headers.
- Observability: Prometheus + Grafana + Loki + structured Pino logging.

## Constraints (NON-NEGOTIABLE)
- YAGNI/KISS: Docker Compose only. No K8s, no microservices.
- pgBouncer **transaction** mode (Prisma requires `pgbouncer=true&connection_limit=1`).
- Socket.io client = **singleton** (one connection/user, not per component).
- React Query `staleTime` MUST be set (default 0 defeats caching).
- Meilisearch indexing MUST be async via queue (never block HTTP).
- Nginx MUST handle WS upgrade (`proxy_http_version 1.1` + Upgrade headers).
- Monitoring in **separate** `monitoring/docker-compose.yml` (non-blocking).

## Phases

| # | Phase | Group | Depends on | Effort | Status |
|---|-------|-------|-----------|--------|--------|
| 1 | [Redis + pgBouncer + Docker upgrade](phase-01-redis-pgbouncer-infra.md) | A | — | 8h | completed |
| 2 | [BullMQ job queues](phase-02-bullmq-queues.md) | A | P1 | 12h | completed |
| 3 | [WebSocket live comments](phase-03-websocket-live-comments.md) | B | P1 | 12h | completed |
| 4 | [React Query + infinite scroll](phase-04-react-query-infinite-scroll.md) | C | — | 12h | completed |
| 5 | [Materialized views + pg_cron](phase-05-materialized-views-pgcron.md) | D | — | 8h | completed |
| 6 | [Meilisearch integration](phase-06-meilisearch.md) | D | P2 | 10h | completed |
| 7 | [Nginx reverse proxy](phase-07-nginx-reverse-proxy.md) | E | P3 | 6h | completed |
| 8 | [Prometheus + Grafana + Loki](phase-08-monitoring-observability.md) | E | — | 8h | completed |

## Parallel Execution

```
P1 (Redis+pgBouncer) ── START HERE (Group A gate)
   ├── P2 (BullMQ)        depends P1
   └── P3 (WebSocket)     depends P1
P4 (React Query)          independent — run anytime
P5 (Materialized Views)   independent — run anytime
   └── P6 (Meilisearch)   depends P2 (indexing queue)
P7 (Nginx)                depends P3 (WS proxy config)
P8 (Monitoring)           independent — run last
```

Wave 1: P1, P4, P5 concurrently.
Wave 2: P2, P3 (after P1).
Wave 3: P6 (after P2), P8 (anytime).
Wave 4: P7 (after P3).

## File Ownership (no overlap)
- P1: `docker-compose.yml`, `app.module.ts`, `.env.example`, `pgbouncer.ini`, `redis.conf`
- P2: `apps/backend/src/queue/**`, `auth.service.ts`, `notifications.service.ts`, `posts.service.ts` (scraper only)
- P3: `posts.gateway.ts`, `apps/frontend/src/lib/socket.ts`, `use-comment-socket.ts`, `comments-section.tsx`, `socket-provider.tsx`
- P4: `apps/frontend/src/lib/query-client.ts`, `layout.tsx`, `load-more-posts.tsx`, `like-button.tsx`, `follow-button.tsx`
- P5: `packages/database/prisma/migrations/**`, `posts.service.ts` (trending query only)
- P6: `apps/backend/src/search/**`, `docker-compose.yml` (Meilisearch service block)
- P7: `nginx/**`, `docker-compose.yml` (Nginx service block)
- P8: `apps/backend/src/metrics/**`, `monitoring/**`, `nestjs-pino` setup

> `docker-compose.yml` touched by P1/P6/P7 — P1 owns base file; P6 & P7 append their service blocks only (distinct YAML keys, no conflict). Sequence P1 first.

## Key Risks
- pgBouncer transaction mode + Prisma prepared statements: must set `pgbouncer=true&connection_limit=1`. Migrations must run via direct `DIRECT_URL` (port 5432), not pgBouncer.
- Socket.io optimistic comment + broadcast double-render: dedup by comment ID.
- Meilisearch lacks Vietnamese tokenizer: normalize diacritics at index + query time.
- `posts.service.ts` edited by P2 (scraper) and P5 (trending) — distinct methods, sequence or coordinate.

## Unresolved Questions
1. Existing `notifications.service.ts` fan-out current shape? Phase 2 assumes a per-follower loop to move to queue.
2. Shopee scraper currently sync in `posts.service.ts` — exact method name to wrap async (return jobId).
3. Resend API key + rate limit confirmed in `.env`? Email queue concurrency tuned to it.
4. Does `schema.prisma` already define `Share` model? Trending formula in brief omits shares; uses click/like/comment.
