---
phase: 2
title: Infra & Config Hardening
status: completed
priority: P1
dependencies: []
effort: 0.5 day
---

# Phase 2: Infra & Config Hardening

## Overview

Fix infra config that silently corrupts production: Redis eviction policy can drop BullMQ jobs, scrape crashes without `SHOPEE_AFFILIATE_ID`, `/metrics` publicly scrapable, fake health check, Dockerfile port mismatch.

## Requirements

- Functional: queues survive memory pressure; scrape degrades gracefully; health check reflects real DB state.
- Non-functional: host-dev without Redis keeps working unchanged (zero-infra dev is an existing contract).

## Architecture

### 2a. Redis eviction safety (single instance — red-team simplified)

Current state: one Redis (`docker-compose.yml:22-38`) with `--maxmemory 48gb --maxmemory-policy allkeys-lru` serves cache + BullMQ + Socket.io adapter + SSE pub/sub. Two problems:
1. 48GB is wrong for any realistic VPS.
2. `allkeys-lru` can evict BullMQ job state → silent job loss. BullMQ requires `noeviction`.

**[RED TEAM — MEDIUM, 2 reviewers] Do NOT split into two containers.** Original plan added `redis-cache` + `REDIS_CACHE_URL` + a 3-tier cache factory + a second healthcheck — premature for current scale AND introduces a cutover OOM risk (see below). Simpler correct fix:
- Keep the single `redis` container. Set `--maxmemory 512mb --maxmemory-policy noeviction --appendonly yes`.
- `noeviction` is safe for cache because cache-manager ALWAYS sets a TTL (60s, `app.module.ts:66`) — cache keys self-expire; they never accumulate unbounded. BullMQ jobs are never evicted.
- Document "split cache into a second Redis if/when cache memory pressure appears" as a future step (not now).

**[RED TEAM — MEDIUM] Cutover OOM risk with the existing AOF volume.** The `redis-data` volume holds data accumulated under the old 48gb ceiling. On restart with 512mb `noeviction`, Redis loads the AOF (maxmemory NOT enforced during load); if the loaded dataset exceeds 512mb, every subsequent write returns `OOM command not allowed` → BullMQ `queue.add()` fails (the exact "job loss" this phase fixes, inverted). Mitigation: `redis-cli FLUSHALL` (or delete the `redis-data` volume) as an explicit cutover step, and verify `INFO memory used_memory < maxmemory` before accepting traffic. Cache is 60s-TTL and socket.io adapter state is ephemeral, so flushing is safe.

### 2b. SHOPEE_AFFILIATE_ID graceful degrade (user decision: degrade)

`affiliate-link-generator.ts:9` uses `getOrThrow` → whole scrape throws when env is missing, and docker-compose doesn't even pass the var. Fix:
- `generate()` → `config.get()`; when absent, return `productUrl` unchanged (the scraped affiliate URL is only a pre-fill suggestion — users paste their own affiliate link anyway).
- Add `SHOPEE_AFFILIATE_ID: ${SHOPEE_AFFILIATE_ID:-}` to backend env in docker-compose.
- Align README/`.env.example` comments ("optional" now true).

### 2c. Protect /metrics

`nginx/snippets/app-locations.conf:57` proxies `/metrics` to the world.

**[RED TEAM — HIGH] Do NOT blindly delete the location.** The plan assumed Prometheus reaches `backend:3066` over a shared compose network, but `monitoring/docker-compose.monitoring.yml` declares NO shared/external network — it runs in its own project network, so `backend:3066` may not resolve from Prometheus. Removing the nginx `/metrics` location could kill all scraping.

**DECIDED 2026-07-02 — keep the location, restrict by IP (do NOT delete).** Lowest-risk: preserve whatever scrape path currently works (likely via nginx), just block the public internet. In `app-locations.conf` `/metrics` block add:
```
location /metrics {
  allow 127.0.0.1;
  allow 172.16.0.0/12;   # Docker bridge networks
  allow 10.0.0.0/8;      # compose/overlay
  deny all;
  proxy_pass http://nest_upstream;
}
```
Still add a "Prometheus target UP" verification step after the change (grep `prometheus.yml` target, curl Grafana datasource). If verification shows Prometheus scrapes over a different path, adjust the allow-list to that source IP — but never leave `/metrics` open to `deny all`-less public.

### 2d. Real health check

`health.controller.ts` returns static `{ok:true}`. Change to `SELECT 1` via PrismaService; on failure → 503. Keep it dependency-light (no @nestjs/terminus needed — KISS). Docker healthcheck already hits `/api/health`, now it means something. Optional `redis.ping()` only when REDIS_CLIENT is non-null; Redis failure reports `degraded: true` but still 200 (app functions without Redis).

### 2e. Cosmetics with operational impact

- `apps/backend/Dockerfile:31` `EXPOSE 3001` → `EXPOSE 3066` (matches PORT).
- `docker-compose.yml` redis healthcheck unchanged; add `redis-cache` healthcheck mirror.

## Related Code Files

- Modify: `docker-compose.yml` (redis flags → 512mb/noeviction, backend env: SHOPEE_AFFILIATE_ID; NO redis-cache service)
- Modify: `apps/backend/src/scraper/affiliate-link-generator.ts` (degrade)
- Modify: `apps/backend/src/health.controller.ts` (real DB ping)
- Modify: `nginx/snippets/app-locations.conf` (metrics allow/deny — keep location, block public — see 2c)
- Modify: `apps/backend/Dockerfile` (EXPOSE 3066)
- Modify: `.env.example`, `README.md` (affiliate optional; redis single-instance note)
- Modify: `apps/backend/test/scraper.spec.ts` (generator degrade case)
- NOTE: no `app.module.ts` cache-factory change (single Redis retained)

## Implementation Steps

1. docker-compose: `redis` flags → `--maxmemory 512mb --maxmemory-policy noeviction --appendonly yes`; wire `SHOPEE_AFFILIATE_ID` into backend env. Cutover: `FLUSHALL` old volume, verify `used_memory < maxmemory`.
2. AffiliateLinkGenerator: optional env; absent → return productUrl as-is; unit test both branches.
3. HealthController: inject PrismaService, `SELECT 1`, 503 on DB failure; optional Redis ping → `degraded` flag (still 200 without Redis).
4. /metrics: add nginx allow/deny (private ranges + deny all), keep proxy_pass; then verify Prometheus target still UP.
5. Dockerfile EXPOSE 3066.
6. `docker compose config` validate; boot stack; verify Bull Board queues healthy, `redis-cli config get maxmemory-policy` = noeviction, Prometheus target UP.

## Success Criteria

- [ ] `redis-cli config get maxmemory-policy` → `noeviction`; `used_memory < maxmemory` after AOF load.
- [ ] Cache keys still work (TTL-expiring) on the single noeviction instance; BullMQ enqueue never OOMs.
- [ ] Scrape a Shopee URL with `SHOPEE_AFFILIATE_ID` unset → returns data, `affiliateUrl === productUrl`.
- [ ] Prometheus target UP after the /metrics change; `/metrics` not reachable from public internet.
- [ ] Stop Postgres → `/api/health` returns 503; Docker marks backend unhealthy.
- [ ] Host dev without any Redis env still boots (in-memory cache fallback).

## Risk Assessment

- Single Redis noeviction + 60s cache TTL: cache can't grow unbounded; verified against BullMQ's noeviction requirement. Cutover FLUSHALL prevents AOF-load OOM.
- /metrics topology must be verified empirically before change (red-team H) — don't assume the compose network resolves.
- Health check adds a DB query per 15s per instance — trivial.
