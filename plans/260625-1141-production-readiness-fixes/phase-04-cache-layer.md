# Phase 4 — Cache Layer (trending + explore)

## Context Links
- `apps/backend/src/posts/posts.service.ts` (getTrending, findExplore)
- `apps/backend/src/app.module.ts`
- Depends on Phase 1 (SQL getTrending)

## Overview
- **Priority:** P2
- **Status:** completed
- Trending and explore feed recompute on every request. Add a 60s cache. **No Redis hard dependency** — use `@nestjs/cache-manager` in-memory by default, optionally back by Redis only if `REDIS_URL` env present.

## Key Insights
- `@nestjs/cache-manager` defaults to in-memory LRU — zero infra. This satisfies "60s cache" for single-instance deploys, which is the current setup (no Redis env var exists).
- Redis only matters for multi-instance cache coherence. YAGNI now, but make the store swappable so adding Redis later is a config change, not a rewrite.
- Cache the SERVICE method output, not the controller — keep keys explicit (`trending:<limit>`, `explore:<categoryId>:<offset>:<limit>`). Avoid `CacheInterceptor` auto-keying (it keys on URL and ignores auth context; explicit is safer + DRY).

## Requirements
- Functional: identical responses within 60s window served from cache; cache invalidated by TTL only (no manual invalidation needed for a feed).
- Non-functional: works with zero external services; Redis is opt-in via env.

## Architecture

### Module setup (`app.module.ts`)
```ts
CacheModule.registerAsync({
  isGlobal: true,
  useFactory: () => {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      return { store: redisStore, url: redisUrl, ttl: 60_000 };
    }
    return { ttl: 60_000, max: 500 }; // in-memory default
  },
});
```
Add `cache-manager` (+ `@keyv/redis` or `cache-manager-redis-yet` only if we want the Redis branch wired; otherwise gate the redis import behind the env check and lazy-require). KISS: ship in-memory now; leave a clearly-commented Redis branch that requires the redis package only when `REDIS_URL` is set. Do NOT add redis package to deps if not using it — document install step in the Redis branch comment.

### Service usage (`posts.service.ts`)
Inject `@Inject(CACHE_MANAGER) private cache: Cache`. Wrap:
```ts
async getTrending(limit = 20) {
  const key = `trending:${limit}`;
  const hit = await this.cache.get(key);
  if (hit) return hit;
  const result = await this.queryTrending(limit); // the Phase-1 SQL
  await this.cache.set(key, result, 60_000);
  return result;
}
```
Same pattern for `findExplore` with composite key. Extract a tiny private `cached(key, fn, ttl)` helper to avoid repeating get/set (DRY).

## Related Code Files
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/posts/posts.service.ts`
- Modify: `apps/backend/package.json` (add `@nestjs/cache-manager`, `cache-manager`)
- Modify: `.env.example` (document optional `REDIS_URL`)

## Implementation Steps
1. Install `@nestjs/cache-manager cache-manager`.
2. Register CacheModule (in-memory default, Redis-gated branch commented).
3. Add `cached()` helper + wrap getTrending and findExplore.
4. Document `REDIS_URL` (optional) in `.env.example`.
5. `pnpm --filter @app/backend build`.

## Todo List
- [ ] Install cache-manager deps
- [ ] CacheModule registration (env-gated store)
- [ ] cached() helper
- [ ] Wrap getTrending + findExplore
- [ ] Document REDIS_URL optional
- [ ] Build passes

## Success Criteria
- Two identical trending requests within 60s → second skips DB (verify via query log).
- Removing `REDIS_URL` still works (in-memory). Setting it routes to Redis (if package installed).
- TTL expiry triggers fresh recompute after 60s.

## Risk Assessment
- Stale data up to 60s — acceptable for feed/trending (not for counters; we don't cache those).
- In-memory cache not shared across instances — documented limitation; Redis is the upgrade path.
- Caching mutable objects: cache a serializable snapshot; ensure no Prisma model instance leaks (already plain objects from mappers).

## Security Considerations
- Cache keys must not include user identity for public feeds (they don't — feeds are public). Never cache authenticated per-user responses under shared keys.

## Next Steps
- After Phase 1. Independent of Phase 2/5/6.
