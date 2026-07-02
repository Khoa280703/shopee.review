---
title: "Phase 2 — BullMQ Job Queues (email, scraper, notification)"
phase: 2
group: A
priority: P1
status: completed
effort: 12h
depends_on: [1]
blocks: [6]
created: 2026-06-25
---

# Phase 2 — BullMQ Job Queues

## Context Links
- Research: `research/researcher-01-backend-infra.md` (Topic 1.2 BullMQ, 1.4 Bull Board)
- Scout: `auth.service.ts` (email verify sync), `posts.service.ts` (Shopee scrape sync), `notifications.service.ts` (fan-out).

## Overview
- **Priority:** P1
- **Status:** completed
- Move blocking work off the HTTP path: email (Resend), Shopee scraping (return jobId + poll), notification fan-out for high-follower users. Bull Board dashboard at `/admin/queues`.

## Key Insights
- 3 queues: `email-queue`, `scraper-queue`, `notification-queue`.
- Email: low concurrency (Resend rate limit), `attempts: 3`, exponential backoff.
- Scraper: higher concurrency, `attempts: 2`, fixed backoff; cache result in Redis 24h.
- Notification fan-out only queued for users with 1k+ followers (small follower counts stay sync — YAGNI).
- Bull Board secured by basic auth / admin token in `main.ts`.

## Requirements
**Functional**
- `auth.service.ts` enqueues verification email instead of awaiting Resend.
- `posts.service.ts` scrape endpoint returns `{ jobId }`; client polls status endpoint for scraped product data.
- `notifications.service.ts` enqueues fan-out job when follower count ≥ 1000; processor batches inserts.

**Non-functional**
- Jobs durable across restart (Redis AOF from Phase 1).
- `removeOnComplete: { age: 3600 }`, `removeOnFail: { age: 86400 }`.

## Architecture
```
Controller ──add()──> Queue (Redis) ──> Processor (WorkerHost) ──> Resend / scraper / DB
Scrape: POST /posts/scrape -> {jobId}; GET /posts/scrape/:jobId -> {status,data}
```

## Related Code Files
**Create**
- `apps/backend/src/queue/queue.module.ts` — BullModule.forRoot + registerQueue(3) + Bull Board.
- `apps/backend/src/queue/queues/email.processor.ts`
- `apps/backend/src/queue/queues/scraper.processor.ts`
- `apps/backend/src/queue/queues/notification.processor.ts`
- `apps/backend/src/queue/queue.constants.ts` — queue names/job names.

**Modify**
- `apps/backend/src/app.module.ts` — import QueueModule (note: P1 also edits this file; coordinate sequence — P1 first).
- `apps/backend/src/auth/auth.service.ts` — inject `email-queue`, enqueue verify email.
- `apps/backend/src/posts/posts.service.ts` — inject `scraper-queue`, return jobId; add status lookup.
- `apps/backend/src/posts/posts.controller.ts` — add `GET /posts/scrape/:jobId`.
- `apps/backend/src/notifications/notifications.service.ts` — inject `notification-queue`, conditional fan-out.
- `apps/backend/src/main.ts` — mount Bull Board auth middleware on `/admin/queues`.

## Implementation Steps
1. Install: `@nestjs/bullmq bullmq @bull-board/nestjs @bull-board/api @bull-board/express`.
2. Create `queue.constants.ts` with `EMAIL_QUEUE='email-queue'`, `SCRAPER_QUEUE='scraper-queue'`, `NOTIFICATION_QUEUE='notification-queue'` + job-name consts.
3. Create `queue.module.ts`: `BullModule.forRoot({ connection: { url: process.env.REDIS_URL } })`, `registerQueue` with per-queue `defaultJobOptions`, Bull Board `forRoot({ route:'/admin/queues' })` + `forFeature` ×3.
4. Implement `email.processor.ts` (WorkerHost) — call existing EmailService/Resend. Concurrency 2.
5. Implement `scraper.processor.ts` — wrap existing scrape logic; Redis cache `shopee:{url}` 24h; concurrency 4.
6. Implement `notification.processor.ts` — fan-out: page through followers, batch `createMany` notifications.
7. Refactor `auth.service.ts`: replace `await sendEmail()` with `emailQueue.add('verify', payload)`.
8. Refactor `posts.service.ts` scrape: enqueue, return jobId; add `getScrapeResult(jobId)` reading job state/return value.
9. Add controller route `GET /posts/scrape/:jobId` → `{ status, data? }`.
10. Refactor `notifications.service.ts`: if `followerCount >= 1000` enqueue fan-out, else keep inline (KISS).
11. Mount Bull Board auth in `main.ts`: check `Authorization` bearer == `process.env.ADMIN_TOKEN`, else 401.
12. Verify: enqueue test jobs, watch them complete in `/admin/queues`.

## Todo List
- [ ] Install BullMQ + Bull Board deps
- [ ] queue.constants.ts
- [ ] queue.module.ts (3 queues + board)
- [ ] email.processor.ts
- [ ] scraper.processor.ts (+ Redis cache)
- [ ] notification.processor.ts (fan-out batch)
- [ ] auth.service async email
- [ ] posts scrape async + jobId status endpoint
- [ ] notifications conditional fan-out
- [ ] Bull Board auth in main.ts
- [ ] End-to-end job processing test

## Success Criteria
- Register endpoint returns immediately; verify email lands via processed job.
- Scrape returns jobId; polling returns scraped data once done.
- High-follower post triggers queued fan-out; notifications appear.
- `/admin/queues` shows queues, rejects unauthenticated access.

## Risk Assessment
- **Scraper concurrency → Shopee 429/403** → start concurrency 4; monitor; back off if blocked.
- **`posts.service.ts` shared with Phase 5** → P2 edits scrape methods only, P5 edits trending query only; sequence to avoid merge conflict.
- **Lost jobs on crash** → AOF persistence (Phase 1) + `attempts`/backoff.

## Security Considerations
- Bull Board behind admin token; never expose publicly without Nginx auth too (Phase 7).
- Validate scrape URL is a Shopee domain before enqueue (SSRF guard).

## Next Steps
- Provides indexing queue mechanism reused by Phase 6 (Meilisearch sync).
