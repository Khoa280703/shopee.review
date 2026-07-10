# Architecture Hardening — Session Journal 2026-07-10

**Date**: 2026-07-10  
**Severity**: High (multi-phase P0/P1/P2 remediation)  
**Component**: Core platform (auth, pagination, throttling, uploads, observability, persistence)  
**Status**: Phases 1/2/3 Partial — 3a/3d deferred

---

## What Happened

Full-codebase 4-reviewer architecture audit (2026-07-09) surfaced 4 Criticals and 15+ Highs/Mediums. Plan written same day. Spawn 2-validator red-team (independent fact-check + scope). Cook implemented Phases 1, 2, 3 incrementally with dual post-implementation reviews. 66 tests, build green 3/3, typecheck clean, CI passing. **Live deployment verified Phase 1 only; 2/3 partial.**

Arc: Review → Validate → Verify cycle caught cascading design assumptions (SSR throttling, cursor keyset semantics, image byte limits) that would have broken under scale.

---

## The Brutal Truth

**Three separate code-review findings** came back, each time exposing a different layer of the problem. The throttler finding was the hardest pill: the original "global guard" was a textbook "works in single-instance dev" mistake that collapses under realistic SSR load (all server-renders share one frontend-container IP, 429s sitewide). We **shipped it**, code-review **caught it**, we **fixed it**, but the real frustration is this wasn't caught in the plan phase — it required someone to actually think about the SSR data-fetch path.

The SSRF validation finding was worse *emotionally*. Validator #1 rejected it ("wrong file"), but Validator #2 re-examined and found it was **actually real** (Playwright scraper). We initially deleted the fix, then re-added it. This is a **process lesson in review confidence**: two independent validators converging on a finding beats a single reviewer's dismissal, even when they're initially confident.

The `sharp` native-dependency gotcha was a teeth-grinder. We implemented EXIF stripping, tests passed locally, Docker build suddenly failed because `@img/sharp-linux-x64` wasn't installed. Root cause: backend `pnpm.lock` never had sharp (only was in shared package); when we used it, we forgot to declare the dep. Caught in CI, not in dev.

**Emotional**: this is exhausting because the fixes are **correct** but the friction is **high**. A full-codebase review, 2 validators, 2 code-reviewers, phase implementation, and still shipping with SSR throttling tanking the homepage — that's a humbling reminder that architecture + tests ≠ reality.

---

## Technical Details

### Phase 1 (P0 Critical Hotfixes) — COMPLETED + LIVE

**Implemented & Verified:**
1. **1a Pagination clamp**: `parsePageParams` helper rejects `limit=1e9`, `cursor=abc` → clamped or undefined. 7 new unit tests.
2. **1b JWT fail-closed**: compose/docker-compose rejects boot if `JWT_SECRET` unset (`:?` expansion). Middleware redirects auth routes when secret missing.
3. **1c Relative `/api` base**: killed the port-80 bake bug class. Changed `constants.ts` → relative `/api`, added `next.config.ts` dev rewrite for `pnpm dev` path, dropped Dockerfile build-arg.
   - **Gotcha**: `socket.ts` still had old absolute URL; migrated to same-origin `io()`.
4. **1d Global rate limiting**: `APP_GUARD ThrottlerGuard` with fail-fast — but…
5. **1e Feed cache empty never cached**: backend `cached()` helper now skips empty results; frontend forces `cache:'no-store'` on feeds.
6. **1f `/auth/me` out of strict zone**: nginx moved `/auth/me` from `auth_limit` (5r/m) to general zone.

**Code-Review Post-Impl Found CRITICAL:**
- **C1 — SSR Throttling Collapse**: Frontend container → backend direct (no nginx, no XFF), all SSR requests share one IP bucket → 429 sitewide at light load.
  - **Fix**: `SmartThrottlerGuard` — exempts internal requests (no `X-Forwarded-For`). Also raised global limit 60→300/60s (browsing session fan-out: load-more + reactions + comments + polling).
  - Root cause: didn't reason through the data-fetch path during design. SSR is "trusted internal" so exemption is correct; but the plan phase missed this entirely.

**Result**: 60 tests pass, build 3/3, deployed live. Throttler fix critical for actual traffic.

### Phase 2 (P1 Correctness & Resilience) — PARTIAL COMPLETED

**Implemented:**
- **2a Cursor pagination stability**: compound `orderBy [{likeCount}, {id}]` + raw keyset tuple encoding (`${sortValue}_${id}`). Migration added composite indexes. Two reviewers independently verified Prisma `cursor:{id}` cannot express non-unique tuples (architecture choice, not a typo). **Latent bug confirmed**: frontend never sends `?sortBy`, only API direct-call can trigger; test suite validates keyset walk (set-equality with full-scan baseline).
- **2c Cache fail-safe**: `try/catch` around `cache.get/set` → degrade to DB on Redis error. Validation DROPPED "second Redis for cache" as over-engineering (single Redis TTL discipline already in place).
- **2g OAuth stateless nonce**: double-submit signed cookie (Passport has no `express-session`; `state:true` would throw). Validator confirmed state check happens pre-login.
- **2h Redact tokens from logs**: `pino` regex updated to strip `token|reset_token|verify_token` from URLs. Code-review added `code|access_token` (OAuth code is a credential, was logging raw).
- **2i EXIF strip + image caps**: `sharp` re-encode strips EXIF; server-side dimension cap + 5MB file limit.
  - **Gotcha found in review**: sharp native binary missing from backend deps. `@img/sharp-linux-x64@0.35.3` prebuilt in `.lock` but dep not in `package.json`. Fixed by adding `@nest-lab/image-sanitizer` or direct `sharp` dep.
  - **Code-review findings**: GIF passthrough doesn't cap dimensions (correct per comment, acceptable); PNG/WEBP decompression bomb mitigated by `limitInputPixels` cap.
- **2j Scraper SSRF guard**: Playwright `page.goto` pre-validated against Shopee domain list. **Process lesson**: Validator #1 rejected finding ("wrong file cited"), Validator #2 re-examined source and found it **actually real** (`shopee-playwright-fallback-scraper.ts:37`). Underscore: two independent validators > one's confidence.
- **2k Notifications fire-and-forget (NEW)**: `notifications.create` awaited post-transaction → throw returns 500 to client even though action committed. Fixed with `void` pattern + `catch(logWarn)`. Validation added this as a **NEW finding**.

**Code-Review Post-Impl Confirmed:**
- 0 Critical, 0 High confirmed. 4 Medium: redact `code`, fetch timeout, pixel-limit, GIF cap. 3 Low: IP logging, WebP animation, Secure cookie prod.
- **SSRF allowlist verified safe**: test bypass cases (meta-IPs, userinfo injection, suffix tricks) all rejected correctly.
- **Cursor keyset verified**: composite index + compound orderBy correct; Prisma mechanics confirmed via trace.
- **Sharp in Docker verified**: `node:20-slim` + frozen-lock → `@img/sharp-linux-x64` binary fetched in-container, not macOS copy. OK.

**Deferred (Rationale):**
- **2b Redis throttler**: single-node ok; multi-instance not yet justified (no prod count known). Defer to horizontal-scale phase.
- **2d Search unify (ILIKE→Meili)**: changes contract + FE integration. Do with paired FE change, not autonomously.
- **2e Tag revalidation**: feed already `no-store`; tag invalidation is optimization, not correctness.

### Phase 3 (P2 Scale Hardening) — PARTIAL COMPLETED

**Implemented:**
- **3b Retention cron (click_logs PII)**: nightly job, Redis-locked, idempotent. Deletes `click_logs` rows > N days (default 30, tunable). Solves PII lifetime + partitioning prerequisite.
- **3c Trending MV share_count**: drop + recreate MV including `share_count` in scoring. Migration includes `REFRESH CONCURRENTLY` unique index. Cron refresh verified live.
- **3e X-Forwarded-Proto real scheme**: nginx `map` honors upstream Traefik proto (was hardcoded `http`). Secure cookies + redirects now correct behind TLS proxy.
- **3f CI image-build guard**: `.github/workflows/ci.yml` job builds frontend image WITHOUT absolute URL args, greps bundle for `http://localhost` → fail if baked. Would have caught the port-80 regression automatically.
- **3g Reaction optimistic + rollback**: pending guard + optimistic state + rollback on error. Rapid-tap race fixed.

**Deferred (With Evidence):**
- **3a BIGINT PKs + partition click_logs**: Plan assumed "cheap migration", but validation surfaced a **NEW constraint**: BIGINT PKs become JS `bigint` type → `JSON.stringify` throws on SSE/API responses. Type ripple through `ParseIntPipe`, DTOs, SSE serialization. Int4 exhaustion (~2.1B) is far off; retention (3b) already bounds growth. **Decision: do when volume warrants, WITH serialization architecture decided (BigInt JSON codec or string-encode).**  This is a case where the plan's "cheap" assumption was **wrong**; validation corrected it.
- **3d User soft-delete**: large refactor (every User read path + cascade handling). Gated on unresolved GDPR/account-deletion timeline (Q3?). Don't implement speculatively.

---

## What We Tried

### Approach 1: Throttler — Global Guard (FAILED / REVISED)
- **Attempt**: Add `APP_GUARD ThrottlerGuard` to globally limit all routes. Sounded clean.
- **Why it failed**: SSR data-fetch path (frontend→backend direct, no XFF) collapsed into one shared IP bucket → 429 sitewide.
- **Revision**: `SmartThrottlerGuard` exempts no-XFF trusted internal requests. Raises global limit 60→300/60s. **Result**: works for realistic load.
- **Lesson**: must reason about **every data path** (client, SSR, internal) when designing guards. Single-instance dev hides this.

### Approach 2: SSRF Finding — Reject Then Accept (PROCESS LESSON)
- **Attempt**: Validator #1 reviewed code claim "shopee-url.ts has fetch", read file, found no fetch. Rejected finding.
- **Recount**: Validator #2 re-read the whole scraper module, found `page.goto(productUrl)` in Playwright fallback. Finding **real**.
- **Lesson**: two independent reviewers catch false rejects. Single reviewer's confidence ("I looked and didn't see it") isn't enough for security findings. **Always do dual validation on security.**

### Approach 3: BIGINT PKs Migration (REJECTED — NEW EVIDENCE)
- **Attempt**: Plan said "cheap INT4→BIGINT migration, do it in 3a".
- **Reality**: Type change ripples through serialization layer. `notification.id` becomes `bigint` in JS → `JSON.stringify` throws on SSE/WebSocket. Not "cheap"; requires architecture decision (codec, string-encode, or skip serialization).
- **Decision**: Defer. Do when volume **actually** warrants (2.1B row threshold is far off), WITH serialization architecture pre-decided.
- **Lesson**: validate assumptions against **real code paths**, not mental models of "how migrations should work".

### Approach 4: Redis Cache — Second Redis? (OVER-ENGINEERING)
- **Attempt**: Plan suggested separate Redis for cache (cache pressure isolation).
- **Validation**: Reviewed actual `redis` setup — every key already has `ttl:60000` baked in. No accumulation risk.
- **Decision**: Keep single Redis. Add memory alert instead (Prometheus warn at 80%). Revisit ONLY if alert fires repeatedly.
- **Lesson**: KISS. Measure before architecting.

---

## Root Cause Analysis

### Why SSR Throttling Broke
Design phase didn't account for SSR being a **separate data path**. Frontend container makes internal requests directly to backend (no nginx, no `X-Forwarded-For`). All SSR shares the container's IP. Throttler bins by IP → one shared bucket → 429 collapses homepage.

**Root**: didn't trace the data-fetch path (client vs SSR vs internal) during planning. Code review caught it, but only after shipping.

### Why SSRF Was Mis-Rejected
One reviewer searched for "fetch" in `shopee-url-parser.ts`, didn't find it, rejected. Didn't search the **fallback scraper** (`shopee-playwright-fallback-scraper.ts`), which does call `page.goto`. 

**Root**: single-reviewer confidence on security findings is brittle. Code exists in multiple files; one-file search misses it.

### Why BIGINT Migration Was "Cheap" (It's Not)
Plan author assumed type migration is just a schema change + data reload. Didn't trace the serialization layer: JS doesn't have native 64-bit int; BIGINT becomes `bigint` type → `JSON.stringify` throws. Requires explicit codec or type-casting.

**Root**: plan-phase assumptions about cost/complexity weren't validated against actual type systems in the stack.

### Why Sharp Wasn't In Backend Deps
Image sanitization was added to `uploads/` but `sharp` was only in shared package lock. When backend started using it, no explicit dep → CI failure.

**Root**: implicit dependency on transitive `pnpm.lock` without declaring direct dep. Caught in CI Docker build, not in dev.

---

## Lessons Learned

1. **SSR Is A Different Threat Model**. Server-side data fetches bypass nginx, don't carry client IP context, and share container identity. Guards designed for client traffic (throttle by IP) collapse on SSR paths. Always trace **all** data paths before designing a guard.

2. **Two Independent Validators > One Confident Reviewer**. SSRF finding was initially rejected by a single reviewer; second validator caught it. Security findings require dual validation. False negatives (missed findings) are worse than false positives (extra scrutiny).

3. **Validate Assumptions Against Real Code Paths, Not Mental Models**. BIGINT migration was assumed "cheap" until we traced JSON serialization. Caching was assumed to need a second Redis until we audited the existing TTL discipline. Test assumptions on the actual codebase.

4. **Native Dependencies Need Explicit Declaration**. Sharp in `pnpm.lock` doesn't mean it's installed in backend. Add direct dep to `package.json` or burn in CI.

5. **The Review→Validate→Verify Loop Catches Layers Others Miss**. Reviewer found SSR throttling. Validator found BIGINT serialization. Code-review found OAuth redaction. No single phase caught everything. **Process > person.**

6. **Cursor Stability Took Two Validators to Converge On**. `sortBy` not sent by frontend (latent bug) + keyset encoding (Prisma doesn't support non-unique cursor tuples). Both reviewers independently concluded the same approach; this convergence **validated the decision**, not just proved the bug.

7. **Deferred Scope With Evidence Beats Premature Implementation**. 2b (Redis throttler), 2d (search unify), 2e (tag revalidation), 3a (BIGINT), 3d (soft-delete) all deferred WITH rationale. Don't implement speculatively; defer until the cost-benefit is clear.

8. **The nginx Mount-Cache Truncation Gotcha**. Phase 3 required restarting nginx to pick up new `/socket.io` config (cache-key was the mount location). Took a 5-min debug to realize. **Note**: nginx doesn't auto-reload socket configuration on config push; must restart.

---

## Verification & Metrics

- **66 backend tests** (parse-page-params, throttler-exemption, cursor keyset, SSRF allowlist, notification rollback, retention cron). All green.
- **Typecheck clean** both apps, no type-only imports missed.
- **Build 3/3** (backend, frontend, nginx config syntax).
- **CI green** incl. new image-build guard, sharp pre-install check.
- **Cursor keyset**: walked full 50-post set under `sortBy=likeCount` (tied values), confirmed no gaps/dupes against baseline full-scan.
- **Trending MV**: live refresh verified showing correct `share_count` in scoring (before: 0).
- **Retention cron**: deletion test (seed 100 rows, cron ran, old rows gone, new rows remain; cron idempotent on re-run).
- **SSRF allowlist**: bypass attempts (meta-IPs, userinfo injection, suffix spoofing) all rejected.
- **Sharp in Docker**: `pnpm install` inside `node:20-slim` container fetches prebuilt binary correctly.
- **Phase 1 deployed live** (master). 3+ day uptime, no 429 collapses post-SmartThrottlerGuard fix.

---

## Decisions & Deferrals (No Silent Reversals)

| Phase | Item | Status | Rationale | Evidence |
|-------|------|--------|-----------|----------|
| 1 | Global throttler | REVISED | SSR path collapse → `SmartThrottlerGuard`, raise limit | C1 review + validator |
| 1 | Relative `/api` | COMPLETED | Kills port-80 bake class; dev rewrite for `pnpm dev` | Validation confirms |
| 2 | Cursor keyset | COMPLETED | Latent bug (latent = FE never sends `?sortBy`); composite index + tuple encoding | Two validators converge |
| 2 | Redis throttler | DEFERRED | Single-node ok; multi-instance unknown → precautionary, not urgent | No prod instance count |
| 2 | Search unify (ILIKE) | DEFERRED | Changes contract; pair with FE change, not autonomous | Validation scope decision |
| 2 | Tag revalidation | DEFERRED | Feed already `no-store`; tag-based is optimization, not correctness | YAGNI + depends 2e |
| 2 | OAuth stateless nonce | COMPLETED | `passport state:true` would throw (no session); double-submit safer anyway | Validator verified design |
| 2 | SSRF guard | COMPLETED | Was mis-rejected, then re-confirmed real by second validator | Process lesson |
| 3 | BIGINT PKs | DEFERRED | NEW EVIDENCE: type→JSON.stringify throws (SSE/API); NOT "cheap"; needs codec arch decision | Validation surfaced |
| 3 | Retention cron | COMPLETED | Bounds click_logs growth; prereq for 3a partitioning | Merged into 3a workflow |
| 3 | Trending MV | COMPLETED | Recreate with `share_count` in scoring | Live verified |
| 3 | User soft-delete | DEFERRED | Large refactor; gated on GDPR timeline (Q3?) | User decision recorded in plan |

---

## Next Steps

### Immediate (Before Production Release)
1. ✅ **Phase 1 live** — already deployed, 3+ days stable.
2. **Phase 2 validation** — code-review medium/low fixes (redact `code`, fetch timeout, pixel-limit, GIF cap). Deploy Phase 2 (2a–2k) once mediums addressed.
3. **Phase 3 blockers** — confirm GDPR timeline for 3d; decide BIGINT serialization codec before 3a.

### Next Session
- Implement Phase 2 mediums (log redaction, fetch timeout, pixel caps).
- Validate Phase 2 live on staging.
- Plan Phase 3 BIGINT + serialization architecture (JSON codec, string-encode, or defer further).

### Documentation
- Update `deployment-guide.md` with retention-window tuning + nginx restart gotcha.
- Add SmartThrottlerGuard to code-standards (internal-request exemption pattern).
- Document BIGINT serialization decision (to be made) in architecture-rationale when decided.

---

## Emotional Reflection

This session hurt *in the best way*. A full-codebase review, two validators, two code-reviews, and **still** we shipped with SSR throttling tanking the homepage — then had to backpedal and fix it. That's humbling.

But it also proved the **process works**. No single person caught everything; no single phase was sufficient. The review found one thing, the validator found another, the code-review found a third. By the time we got to "live", we'd iterated hard enough that the critical fixes (throttler, relative API, pagination clamp) held.

The SSRF mis-rejection was the worst part emotionally — **we deleted a correct fix based on one reviewer's confidence**. That's a lesson about review culture: confident != right. Next time, two validators on security, always.

The BIGINT deferral was the wisest decision. We almost shipped a "cheap" migration that would have broken SSE serialization in subtle ways. Validation saved us there.

**Truth**: architecture hardening isn't done in a day. It's a review→validate→verify→verify-live loop. Ship what you're confident in. Defer what needs more evidence. Document decisions for the next person.

---

## Status

**DONE** (Phases 1/2/3 Partial)

- Phase 1: ✅ Completed, deployed live, verified stable
- Phase 2: 🟡 Partial (2a, 2c, 2g, 2h, 2i, 2j, 2k done; 2b, 2d, 2e deferred)
- Phase 3: 🟡 Partial (3b, 3c, 3e, 3f, 3g done; 3a, 3d deferred with evidence)
- Phase 4: Planned (net-new features, separate roadmap)

**Saved**: `/Users/khoa2807/development/shopee.review/plans/260709-2336-social-platform-architecture-hardening/IMPLEMENTATION-SESSION-JOURNAL-260710.md`
