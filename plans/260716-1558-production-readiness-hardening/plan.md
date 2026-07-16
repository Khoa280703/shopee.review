# Production-Readiness Hardening

Status: IN PROGRESS (started 2026-07-16)
Source audit: `plans/reports/production-readiness-audit-260716-1558-full-stack-report.md`
Scope decision: fix all P0→P3 + add tests.
Key decisions: verified = real feature (column + admin grant); COOKIE_SECURE auto-derived from X-Forwarded-Proto; monitoring bind 127.0.0.1 (SSH tunnel only).

Push straight to master (solo dev), conventional commits, no plan/audit IDs in code artifacts.

## Batch A — Infra & config (P0 + infra P1)
- [ ] Postgres: drop public port / bind localhost; password → `${POSTGRES_PASSWORD:?}` (db, pgbouncer, db-backup, DATABASE_URL/DIRECT_URL)
- [ ] Monitoring compose: bind 127.0.0.1 for prometheus/loki/grafana; `${GRAFANA_PASSWORD:?}`
- [ ] `connection_limit=1` → 15
- [ ] `enableShutdownHooks()` + Dockerfile CMD `exec node`
- [ ] nginx `resolver` + variable proxy_pass (kill stale-DNS 502)
- [ ] `ADMIN_TOKEN` fail-fast + timingSafeEqual + nginx limit_req on /admin/queues
- [ ] `/metrics` allow-list tighten
- [ ] nginx `8081` bind 127.0.0.1
- [ ] COOKIE_SECURE auto-derive from X-Forwarded-Proto (auth cookie + oauth_state)
- [ ] nginx add_header inheritance (security headers on /api & /_next/static)

## Batch B — Backend code + data
- [ ] Feed cache degrade on Redis error (DATA-H2)
- [ ] Feed limit clamp via parsePageParams (SEC-M1)
- [ ] Notification fanout idempotent: partial unique + migration (DATA-M1)
- [ ] Meili reconcile: admin reindex endpoint + watermark note (DATA-M2)
- [ ] deleteComment replyCount inside tx (DATA-M3)
- [ ] Batched retention delete (DATA-M4)
- [ ] getPostStats take cap (DATA-M5)
- [ ] searchUsers index (DATA-M6)
- [ ] Register enumeration generic message (SEC-M3)
- [ ] verified column + migration + selects + admin grant endpoint + audit
- [ ] P3: SSE stream Map cleanup, double-unfollow catch, share auth/dedup, click dedup note

## Batch C — Frontend
- [ ] FE-H1 notifications markAllRead
- [ ] FE-H2 report-dialog catch
- [ ] FE-H3 NaN postId → notFound
- [ ] FE-M1/M7 mutation + fetch error feedback pattern
- [ ] FE-M2 verified badge gated on user.verified
- [ ] FE-M3 reaction placeholderData
- [ ] FE-M4 timeAgo hydration-safe
- [ ] FE-M5 loading.tsx
- [ ] FE-M6 login ?next=
- [ ] P3: /admin middleware claim, a11y dialog, scrape cancel, sitemap profiles, remotePatterns env-gate, devtools dep, self-follow, apiFetch header, dead code

## Batch D — Tests
- [ ] Backend unit tests for new behavior (feed clamp/degrade, notification idempotency, verified, retention batch)
- [ ] Frontend e2e smoke (Playwright): login → post → react → comment; error-path assertions
- [ ] CI: add lint + backend build (+ e2e if feasible)

## Deferred (unchanged from prior plan)
click_logs partitioning, user soft-delete/GDPR, 2FA/phone-OTP, feed fanout-on-write.
Docs fixes (deployment-guide, system-architecture) — end of run.
