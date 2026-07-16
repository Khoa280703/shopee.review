# Production-Readiness Audit — shopee.review

Date: 2026-07-16. Scope: full-stack (security/authz, backend architecture + data, frontend, infra). Method: 4 parallel read-only reviewers; every Critical/High verified against source by controller. Baseline: 71 backend unit tests pass; **0 frontend tests, 0 e2e**; CI green on master.

## Verdict

Code architecture is **fundamentally sound** — authz/IDOR, SQL injection, SSRF, upload, CSRF, cache-cross-user, XSS surfaces are all clean and well-defended (see verified-OK lists per section). What blocks production is **not the app code** — it is **deploy configuration + operational hardening** (2 Critical infra) and a cluster of **user-facing correctness bugs** (frontend). None are deep redesigns; all have small, known fixes.

Not ready to expose publicly as-is. Ready after the P0+P1 batch below (est. small).

---

## P0 — MUST fix before any public VPS exposure (Critical)

| ID | File | Issue | Fix |
|----|------|-------|-----|
| INFRA-C1 | `docker-compose.yml:6-10,107` | Postgres publishes `0.0.0.0:65432` with **hardcoded password `shopee_review_dev`** literal in repo. Anyone port-scanning the VPS logs into the DB. | Remove `ports:` (compose network suffices) or bind `127.0.0.1:`; move password to `${POSTGRES_PASSWORD:?}` (also pgbouncer:51, db-backup:83, DATABASE_URL/DIRECT_URL). |
| INFRA-C2 | `monitoring/docker-compose.monitoring.yml:15-49` | Prometheus/Loki/Grafana bound public, no auth; Loki push API open; Grafana fallback pw `admin`. | Bind `127.0.0.1:` for all three; `${GRAFANA_PASSWORD:?}`; view via SSH tunnel. |
| DATA-C1 | `docker-compose.yml:107` | `connection_limit=1` → entire NestJS process (HTTP + BullMQ workers + crons) serializes on **one** DB connection. One slow query (trending REFRESH, retention DELETE) blocks all API → P2024 timeouts → mass 500s. **Verified.** | Raise `connection_limit` to 10–20 (matches pgBouncer `DEFAULT_POOL_SIZE=10`); keep `pgbouncer=true`. |

## P1 — MUST fix before go-live (High)

**Deploy/ops**
- **INFRA-H1 / DATA-H1 — no graceful shutdown.** `main.ts` never calls `app.enableShutdownHooks()` **(verified)**; `Dockerfile:32` CMD uses `sh -c "... node main.js"` so `sh` is PID 1 and does not forward SIGTERM → node gets SIGKILL on every deploy: in-flight requests dropped, BullMQ jobs stalled (may double-run), Prisma/SSE not closed. Fix: add `enableShutdownHooks()`; change CMD to `exec node ...`.
- **INFRA-H2 — nginx stale upstream DNS.** `nginx.conf:70-77` static `upstream`, no `resolver`. Container recreate → new IP → nginx keeps old → 502 storm until manual reload (the known recurring incident). Fix: `resolver 127.0.0.11 valid=10s;` + variable `proxy_pass`, or auto-restart nginx in deploy.
- **INFRA-H3 — `ADMIN_TOKEN` default `change-me-admin-token`** (`docker-compose.yml:113`) guards public `/admin/queues` Bull Board (job payloads contain emails/reset links). JWT_SECRET fail-fasts but this doesn't. Fix: `${ADMIN_TOKEN:?}`; `crypto.timingSafeEqual`; add `limit_req` to that nginx location.
- **INFRA-H4 — `/metrics` allow-list bypass.** `app-locations.conf:81-87` allows `172.16/12`+`10/8`; Traefik connects from that range → `https://<domain>/metrics` is public. Fix: allow only the Prometheus subnet / isolate metrics on an internal listener.
- **INFRA-H5 — nginx `8081:80` public + `COOKIE_SECURE` default false.** App serves plain HTTP directly, bypassing Traefik TLS; if operator forgets `COOKIE_SECURE=true`, session cookie sniffable. Fix: bind `127.0.0.1:8081` or drop `ports:`; ensure `COOKIE_SECURE=true` in prod (SECURITY-M2).

**Backend**
- **DATA-H2 — FeedService does not degrade on Redis failure** `feed.service.ts:19-27` **(verified)**. `cache.get/set` unguarded; PostsService already documents "Redis error must degrade to DB read, never 500" and does it — Feed violates it. With shared noeviction Redis, OOM → feed 500s. Fix: same try/catch degrade pattern.

**Frontend (user-facing)**
- **FE-H1 — notifications never mark read** `notifications/page.tsx:39-42` **(verified)**. `useEffect([],)` reads `unreadCount` while still `0` (async) → `markAllRead()` never fires → unread badge sticks forever. Fix: depend on `[unreadCount]` + a `hasMarked` ref.
- **FE-H2 — ReportDialog shows success on failure** `report-dialog.tsx:26-33` **(verified)**. `try{}finally{setState('done')}` with no `catch` → "report sent" even on 401/500 + unhandled rejection. Moderation reports silently lost. Fix: `catch` → error + retry.
- **FE-H3 — non-numeric postId → 500 not 404** `[username]/[postId]/page.tsx:61-69`. `Number('abc')=NaN` → backend 400 → not caught by 404 branch → error boundary + HTTP 500 for every junk URL (crawlers, SEO). Fix: `if (!Number.isInteger(id)||id<=0) notFound();` (also in `generateMetadata`).

## P2 — Should fix (Medium)

**Backend/data**
- DATA-M1 fanout notifications not idempotent — `createMany({skipDuplicates})` is a no-op (no unique constraint); job retry after partial insert → duplicate NEW_POST to thousands. Fix: partial unique `(recipient_id, actor_id, post_id, type)` for NEW_POST.
- DATA-M2 Meilisearch drift permanent — enqueue errors swallowed, dead jobs never replayed, backfill only on empty index. Fix: watermark reconcile cron / admin `reindexAll()` (method exists, unexposed).
- DATA-M3 `deleteCommentCore` counts replies outside tx → `commentCount` drift until nightly reconcile. Fix: count inside tx.
- DATA-M4 retention DELETE not batched (`retention.service.ts:67`) — single statement over millions of rows; combined with DATA-C1 = API frozen at 4AM. Fix: chunked delete loop.
- DATA-M5 `getPostStats` unbounded findMany (`stats.service.ts:14`). DATA-M6 `searchUsers` ILIKE `%q%` no index (seq scan). Fix: `take`; pg_trgm/Meili.
- SECURITY-M1 **`/api/feed?limit=` unclamped DoS** `feed.controller.ts:17` — skips `parsePageParams` (every other paginated route clamps to 50). `limit=1e8` → OOM; `limit=abc` → NaN → 500; also bloats Redis cache keys. Fix: `parsePageParams(cursor, limit, {def:20,max:50})`.
- SECURITY-M3 register enumeration — distinct "Email đã dùng" vs "Username tồn tại" leaks account existence (contradicts careful forgot-password anti-enumeration). Fix: generic message.

**Frontend**
- FE-M1 comment/admin/settings mutations have no catch → silent no-op on failure. FE-M7 fetch errors masked as empty state ("follow someone…" when backend is down) in feed/search/saved. Fix: shared error-feedback pattern (home page already does it right).
- FE-M2 **`verified` badge hardcoded on every user** `post-feed-card.tsx:36` **(verified)** — every account (incl. scammers) shows a blue tick on a review platform = trust/integrity risk. Fix: gate on real `post.user.verified` or remove.
- FE-M3 ReactionButton `initialData` treated fresh → own reaction not shown, first tap toggles wrong way + N+1 client requests on scroll. Fix: `placeholderData`.
- FE-M4 `timeAgo` uses `Date.now()` in client components → hydration mismatch. FE-M5 **no `loading.tsx` anywhere** → SSR nav feels frozen. FE-M6 login redirect drops `?next=` → always lands on `/`.

## P3 — Nice to have (Low) — see per-agent lists

Backend: SSE stream Map leak (L1), double-unfollow P2025 uncaught (L2), unauth `POST /:id/share` inflates shareCount (SEC-M5/DATA-L4), click dedup read-then-write drift (L5), banned user's posts stay in feed/search (L6 — confirm intent).
Infra: migrate-on-start no rollback story + `depends_on: service_started` not `_healthy` (M1), backups same-disk no offsite/PITR (M2), no resource limits / log rotation / PG tuning (M3), containers run root (M4), CI has no lint/FE-test/e2e/backend-image-build (M5), dual TLS story Traefik+certbot (M6), nginx add_header inheritance drops security headers on /api & /_next/static (L1), docs claim ".env in VCS" + wrong migration/Traefik description (L2).
Frontend: /admin client-only guard (defense-in-depth), ReportDialog no focus-trap/Esc (a11y), scrape poll not cancelled on unmount, sitemap missing profiles, demo image hosts in prod remotePatterns, react-query-devtools in dependencies, self-follow button on own post, apiFetch header-override trap, dead settings button/ImageCarousel.

## Cross-cutting

- **No frontend tests and no e2e tests** anywhere. For a platform going to prod, at least a smoke e2e (login → post → react → comment) and error-path unit tests for the mutation flows above are worth adding.
- Positive: monitoring (Prometheus scrape + alerts + Grafana dashboard), backups, Sentry (BE+FE), healthchecks are **real and wired**, not aspirational.

## Unresolved questions (need your decision)

1. Prod topology: single backend container or replicas? (affects DATA-C1 severity + multi-instance claims).
2. `COOKIE_SECURE` prod default — set `true` in env, or auto-derive from `X-Forwarded-Proto=https`?
3. `verified` badge — placeholder design or a feature to wire to backend? (decides remove vs implement).
4. Monitoring exposure — SSH-tunnel-only, or behind auth on a subdomain?
5. Banned user's existing posts staying visible in feed/trending/search — intended or gap?
6. Does the VPS `/etc/docker/daemon.json` already set log rotation? (decides INFRA-M3 urgency).
