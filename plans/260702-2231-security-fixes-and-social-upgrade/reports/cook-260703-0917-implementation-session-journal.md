# Implementation Journal — Security Fixes & Social Upgrade

Date: 2026-07-03 · Branch: `security-fixes-and-social-upgrade` · Mode: `/cook --auto --tdd`

## Outcome

All 7 phases implemented, tested, and committed (7 commits + plan docs). 50 backend unit tests pass; both apps typecheck; backend boots; frontend builds (20 static pages); migrations apply data-safe with zero Prisma drift.

## Per-phase

1. **P0 security** — `common/shopee-url.ts` (host-tier validation blocking `an_redir` open-redirect laundering incl. HPP/nested/userinfo), tracker validates before click increment + productUrl fallback, CORS exact-match, `trust proxy` (private ranges), SSE `X-Accel-Buffering` + nginx location + client reconnect (stops on 401). Code-reviewed → fixed trust-proxy hop count, multi-param dest check, dead import.
2. **Infra** — single Redis 512mb `noeviction` (protects BullMQ), affiliate degrade, real DB health check, `/metrics` private-IP allow-list, EXPOSE 3066. Also fixed empty `LOG_LEVEL` boot crash (`||` vs `??`).
3. **Auth** — `tokenVersion` JWT revocation (+ one-time global bump migration), `AuthUser`/`omit`/`sanitize` tightened (no field leak), verify-token 24h expiry + resend, change-password, WS gateway revocation check, FollowButton real state.
4. **DB/perf** — explore 30-day window, click dedup composite index, notifications cursor pagination + single mark-read.
5. **Moderation** — Report + Block models, `isAdmin`/`bannedAt`; report (idempotent, no enumeration oracle), block (interaction guards + feed exclusion), admin (separate delete methods — no bypass flag; ban bumps tokenVersion), env-bootstrapped first admin; `/admin` page + report/block UI. `BlocksModule` split to break dependency cycle.
6. **Social** — `likes`→`reactions` rename (data-safe hand-written migration, constraints renamed, enum-before-column), 6 reaction types with atomic counter (no JSON drift), bookmarks + `/saved`, share counter. Reconciliation rewritten `FROM reactions`.
7. **Docs+CI** — GitHub Actions (unit+build no-DB, integration-db with migrate+drift check); rewrote 4 stale docs + README (removed pre-pivot deal-aggregator content).

## Verification highlights

- Migration `likes→reactions` tested on live DB: rename executed, `prisma migrate diff --exit-code` → "No difference detected", reconciliation SQL runs on renamed table.
- Backend boot smoke-tests each risky phase (health 200, admin 401, reactions/bookmarks endpoints).

## Not verified / follow-up

- Frontend E2E/visual not run (no e2e harness in repo).
- Integration DB tests are structural (migrate+drift) — no seeded row-count assertions authored yet; unit tests mock Prisma.
- `LOG_LEVEL=` empty-string crash was pre-existing; fixed opportunistically.

## Unresolved questions

- Push branch + open PR? (not done — irreversible, awaiting user.)
- `ADMIN_BOOTSTRAP_USERNAME` value to set for the first real admin.
