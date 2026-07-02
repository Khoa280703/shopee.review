# Full Production Optimization Research Summary

**Date:** 2025-06-25  
**Objective:** Research and document best practices for Redis, BullMQ, Socket.io, pgBouncer, and PM2 in a NestJS 10 + PostgreSQL + Next.js 15 stack on a 32-core, 256GB server.

---

## Key Recommendations

### Topic 1: Redis + BullMQ (Queues)
- **Redis Config:** 96GB maxmemory, allkeys-lru policy, AOF persistence
- **BullMQ Queues:**
  - Email: 2 workers (Resend rate-limited)
  - Scraper: 4 workers (Playwright instances)
  - Notification: 1 worker
- **Cache Manager:** Use cache-manager-ioredis with @nestjs/cache-manager for fine-grained control
- **Dashboard:** Deploy Bull Dashboard at `/admin/queues` with auth middleware
- **Resend Pattern:** Queue via BullMQ, 1-3 retries, 2s backoff
- **Scraper Pattern:** Cache results 24h, 4-6 concurrent Playwright instances

### Topic 2: Socket.io Real-Time Comments
- **Architecture:** @nestjs/websockets + Redis adapter for multi-process broadcasting
- **Room Pattern:** `post:{postId}` rooms for isolated comment streams
- **Auth:** JWT in socket.handshake.auth.token, validate on connect
- **Emission:** From service layer (not just gateway) for cache invalidation patterns
- **Next.js Client:** Create SocketProvider context at root layout (persists across routes), initialize Socket.io in useEffect (SSR-safe)
- **Redis Adapter:** Enables all 16 NestJS instances to reach all connected clients via pub/sub

### Topic 3: pgBouncer Connection Pooling
- **Mode:** Transaction mode (critical for Prisma compatibility)
- **Pool Size:** default_pool_size=10, min=5 (16 instances × 10 = 160 connections max)
- **URL Flag:** Add `pgbouncer=true` to Prisma DATABASE_URL
- **Setup:** Docker Compose with pgBouncer container in front of PostgreSQL
- **Max Prepared Statements:** 100 (enables prepared statement reuse in transaction mode)
- **Testing:** Verify with `SELECT count(*) FROM pg_stat_activity;` — should see ~160 active connections

### Topic 4: PM2 Cluster Mode for NestJS
- **Main API:** 16 instances in cluster mode (saturates 16+ cores)
- **Workers:** Email (2), Scraper (4) — separate ecosystem entries
- **Memory:** 800M per instance (total ~100GB available for 16 instances on 256GB server)
- **Zero-Downtime:** Use `pm2 reload` — restarts workers sequentially, 30s shutdown timeout
- **Graceful Shutdown:** Implement SIGTERM handler in NestJS to finish in-flight requests
- **Docker Choice:** pm2-runtime in Docker is fine; PM2 standalone if not containerized
- **Ecosystem.config.js:** Single source of truth for all process configuration

---

## File Structure

```
plans/260625-1444-full-production-optimization/
├── RESEARCH_SUMMARY.md          (this file)
└── research/
    └── researcher-01-backend-infra.md    (detailed research report)
```

---

## Quick Start Files

See `/research/researcher-01-backend-infra.md` for:
1. Full code examples for each topic
2. Docker Compose configurations
3. Exact ecosystem.config.js setup
4. PM2 command reference
5. pgBouncer.ini tuning
6. Socket.io client/server patterns
7. BullMQ processor implementations
8. Implementation checklist

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │   Next.js 15    │
                    │   (Browser)     │
                    └────────┬────────┘
                             │
                     Socket.io WebSocket
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          v                  v                  v
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ NestJS   │       │ NestJS   │  ...  │ NestJS   │  (16 instances)
    │ Instance │       │ Instance │       │ Instance │
    │ (PM2)    │       │ (PM2)    │       │ (PM2)    │
    └────┬─────┘       └────┬─────┘       └────┬─────┘
         │                  │                  │
         └──────────┬───────┴──────┬───────────┘
                    │              │
              ┌─────v────┐   ┌─────v────┐
              │ pgBouncer│   │  Redis   │
              │ (Queue)  │   │ (96GB)   │
              └─────┬────┘   └─────┬────┘
                    │              │
                    │         ┌────┴─────┐
                    │         │  Cache   │
                    │         │  Queues  │
                    │         │ (BullMQ) │
                    │         └──────────┘
              ┌─────v─────┐
              │ PostgreSQL│
              │   (DB)    │
              └───────────┘

Workers (separate ecosystem entries):
- Email Processor (2 instances)
- Shopee Scraper (4 instances)
```

---

## Next Steps

1. **Review detailed report:** `/research/researcher-01-backend-infra.md`
2. **Begin implementation phase:**
   - Phase 1: Redis + BullMQ setup
   - Phase 2: Socket.io + Redis adapter
   - Phase 3: pgBouncer deployment
   - Phase 4: PM2 cluster configuration
3. **Test at scale:** 50+ concurrent Socket.io users, 1000+ jobs/hour in BullMQ
4. **Monitor:** Bull Dashboard, PM2 monit, pgBouncer stats

---

## Document Links

- **Full Research Report:** [researcher-01-backend-infra.md](./research/researcher-01-backend-infra.md)
- **BullMQ Docs:** https://docs.bullmq.io/guide/nestjs
- **NestJS WebSockets:** https://docs.nestjs.com/websockets/adapter
- **Prisma + pgBouncer:** https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
- **PM2 Documentation:** https://pm2.keymetrics.io/docs/usage/cluster-mode/
