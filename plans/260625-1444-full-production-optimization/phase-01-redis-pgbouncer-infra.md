---
title: "Phase 1 — Redis + pgBouncer + Docker Compose Upgrade"
phase: 1
group: A
priority: P1
status: completed
effort: 8h
depends_on: []
blocks: [2, 3]
created: 2026-06-25
---

# Phase 1 — Redis + pgBouncer + Docker Compose Upgrade

## Context Links
- Research: `research/researcher-01-backend-infra.md` (Topic 1.3 Redis config, Topic 3 pgBouncer)
- Scout: `app.module.ts` has in-memory CacheModule; `docker-compose.yml` has Postgres only.

## Overview
- **Priority:** P1 (gate — Group A/B depend on Redis being live)
- **Status:** completed
- Stand up Redis (cache + queue backend) and pgBouncer (transaction-mode pool) in Docker Compose, switch CacheModule to Redis, point Prisma at pgBouncer.

## Key Insights
- Server is 256GB RAM. Brief caps Redis `maxmemory 48GB` (conservative vs research's 96GB — leaves headroom for queues + others). Use `allkeys-lru` + AOF.
- pgBouncer **transaction mode** is the only Prisma-safe pooling mode. Statement mode breaks Prisma.
- Prisma needs TWO URLs: `DATABASE_URL` → pgBouncer (port 6432, `pgbouncer=true&connection_limit=1`) for runtime; `DIRECT_URL` → Postgres (port 5432) for migrations/introspection.

## Requirements
**Functional**
- Redis reachable at `redis:6379` inside compose network.
- pgBouncer reachable at `pgbouncer:6432`, proxying to `postgres:5432`.
- CacheModule uses Redis store; existing `cached()` helper in `posts.service.ts` keeps working unchanged.

**Non-functional**
- Redis AOF persistence (`appendfsync everysec`).
- pgBouncer `pool_mode=transaction`, `default_pool_size=10`, `max_client_conn=100`.
- No app code change required for cache callers (drop-in store swap).

## Architecture
```
NestJS  ──DATABASE_URL(6432)──> pgBouncer ──5432──> PostgreSQL
NestJS  ──REDIS_URL(6379)─────> Redis (cache + future BullMQ + Socket.io adapter)
Prisma migrate ──DIRECT_URL(5432)──> PostgreSQL (bypass pool)
```

## Related Code Files
**Modify**
- `docker-compose.yml` — add `redis` + `pgbouncer` services, volumes, healthchecks.
- `apps/backend/src/app.module.ts` — CacheModule in-memory → `cache-manager-redis-yet`.
- `.env.example` — add `REDIS_URL`, `PGBOUNCER_URL`/`DATABASE_URL`, `DIRECT_URL`.
- `packages/database/prisma/schema.prisma` — add `directUrl = env("DIRECT_URL")` to datasource.

**Create**
- `redis.conf` (or inline `command:` flags).
- `pgbouncer.ini` (or env-driven via `edoburu/pgbouncer` image).

## Implementation Steps
1. Install backend deps: `cache-manager-redis-yet` (and `redis`). Verify `@nestjs/cache-manager` version compatibility.
2. Add Redis service to `docker-compose.yml`:
   - `image: redis:7.2-alpine`
   - `command: redis-server --maxmemory 48gb --maxmemory-policy allkeys-lru --appendonly yes --appendfsync everysec`
   - volume `redis-data:/data`, healthcheck `redis-cli ping`.
3. Add pgBouncer service (`edoburu/pgbouncer` or `bitnami/pgbouncer`):
   - env: `DB_HOST=postgres`, `DB_PORT=5432`, `POOL_MODE=transaction`, `DEFAULT_POOL_SIZE=10`, `MIN_POOL_SIZE=5`, `MAX_CLIENT_CONN=100`, `MAX_PREPARED_STATEMENTS=0` (transaction mode + Prisma).
   - `depends_on: postgres (service_healthy)`.
4. Update `schema.prisma` datasource: add `directUrl = env("DIRECT_URL")`.
5. Update `.env.example`:
   - `DATABASE_URL="postgresql://USER:PASS@pgbouncer:6432/shopee_review?pgbouncer=true&connection_limit=1"`
   - `DIRECT_URL="postgresql://USER:PASS@postgres:5432/shopee_review"`
   - `REDIS_URL="redis://redis:6379"`
6. Swap CacheModule in `app.module.ts` to Redis store via `CacheModule.registerAsync` + `redisStore` from `cache-manager-redis-yet`, `isGlobal: true`, default `ttl`.
7. `docker compose up -d redis pgbouncer` and verify health.
8. Run `npx prisma migrate deploy` (uses DIRECT_URL) to confirm migrations still work.
9. Smoke test: hit `getTrending`/`findExplore` endpoints twice, confirm 2nd hit served from Redis (check `redis-cli KEYS '*'`).

## Todo List
- [ ] Install `cache-manager-redis-yet`
- [ ] Add Redis service + volume + healthcheck
- [ ] Add pgBouncer service + healthcheck
- [ ] Add `directUrl` to schema.prisma datasource
- [ ] Update `.env.example` (3 URLs)
- [ ] Swap CacheModule to Redis store
- [ ] Verify migrations via DIRECT_URL
- [ ] Smoke test cache hit + pool reuse

## Success Criteria
- `redis-cli ping` → PONG; cache keys appear after API calls.
- App connects through pgBouncer (`SHOW POOLS` shows active client conns).
- `prisma migrate deploy` succeeds via DIRECT_URL.
- Existing endpoints behave identically (no regression).

## Risk Assessment
- **Prisma + pgBouncer prepared-statement errors** → set `connection_limit=1` + `pgbouncer=true`, `MAX_PREPARED_STATEMENTS=0`. Mitigation: run migrations only via DIRECT_URL.
- **Redis OOM** → `maxmemory 48gb` + `allkeys-lru` evicts cache safely; queues (Phase 2) tolerate via persistence.
- **Cache store API drift** → `cache-manager-redis-yet` matches cache-manager v5 API used by current `cached()` helper; verify get/set/del signatures.

## Security Considerations
- Redis bound to compose network only (do not publish 6379 to host in prod).
- pgBouncer not exposed to host; only NestJS reaches it.
- Keep DB creds in `.env`, never commit real `.env`.

## Next Steps
- Unblocks Phase 2 (BullMQ uses REDIS_URL) and Phase 3 (Socket.io Redis adapter).
