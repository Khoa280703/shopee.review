# Backend Security & Platform Review — shopee.review

Date: 2026-07-09 | Reviewer: code-reviewer (advisory, no code changed)
Scope: auth, users, moderation, uploads, tracker, scraper, common, main/app.module, metrics/health, security tests.
Method: source-verified (no doc-trust). Prior 7-phase hardening confirmed present; this report lists what is STILL weak/newly broken.

## Critical
None. No direct authz bypass, RCE, or unauthenticated data breach found. Core authz (JWT+tokenVersion revocation, ban re-check per request incl. WS parity, ownership checks on post/comment mutation, admin guard reads DB `isAdmin`) is sound.

## High

### H1 — Global rate limiting absent; most mutating/social endpoints unthrottled
`app.module.ts:61` registers `ThrottlerModule.forRoot` but no `APP_GUARD` ThrottlerGuard. Throttling only applies where `@UseGuards(ThrottlerGuard)` is explicit (auth routes, posts create/scrape, report, share). Unthrottled: comment create (`comments.controller.ts:49`), follow (`follows.controller.ts:10`), react (`reactions.controller.ts:31`), bookmark (`bookmarks.controller.ts:11`), block (`blocks.controller.ts:11`), upload (`uploads.controller.ts:49`), user search (`users.controller.ts:24`), profile update.
Exploit: script authenticates once, POSTs thousands of comments/reactions/follows → notification spam, DB bloat, feed pollution. Social-platform spam economics are wide open.
Fix: register `{ provide: APP_GUARD, useClass: ThrottlerGuard }` globally with a sane default; keep per-route `@Throttle` overrides.

### H2 — Throttler uses in-memory storage under a multi-instance deploy
`app.module.ts:61` has no `ThrottlerStorageRedis`, yet Redis exists and `RedisIoAdapter` implies multi-instance (`main.ts:28`). Each instance keeps its own counter.
Exploit: login limit 10/15min becomes 10×N across N instances behind Traefik → credential brute-force weakened proportional to scale.
Fix: back Throttler with Redis storage so limits are cluster-wide.

### H3 — Unbounded pagination page size (DoS)
`comments.controller.ts:30,45` and `users.controller.ts:76` pass `Number(limit)` with no cap into `take: limit+1`. `getComments` also nests `replies` includes.
Exploit: `GET /api/posts/1/comments?limit=1000000` → giant query + serialization per request → memory/CPU exhaustion, trivially repeatable (see H1, unthrottled).
Fix: clamp with `Math.min(Math.max(n,1),50)` server-side (as already done in `social.service.listFollowers:114`).

## Medium

### M1 — Blind SSRF via Shopee open-redirector in scraper URL parse
`shopee-url-parser.ts:20` does `fetch(url,{method:'HEAD',redirect:'follow'})` on short links; the final-host check happens only AFTER redirects resolve. `s.shopee.vn/an_redir?origin_link=http://169.254.169.254/...` passes the short-link regex, and fetch follows the redirect to the internal target before the post-hoc `SHOPEE_DOMAIN_REGEX` rejects it.
Exploit: authenticated user calls `POST /api/posts/scrape` with such a URL → server issues HEAD to internal/metadata/private-range hosts (blind: timing/error oracle; no body returned).
Fix: resolve redirects manually with `redirect:'manual'`, validate each hop host against `SHOPEE_HOSTS`, and block private/link-local IPs before each request.

### M2 — Google OAuth has no `state` (login CSRF / account fixation)
`google.strategy.ts:16` omits `state: true`; callback is a plain GET (`auth.controller.ts:133`).
Exploit: attacker initiates OAuth, captures their own callback URL, and CSRFs a victim's top-level navigation to it (sameSite=lax permits the cookie set) → victim silently logged into attacker's account (fixation) or attacker links accounts.
Fix: enable `state` (passport state store) and verify it on callback.

### M3 — Inconsistent email-verification gating
`posts.service.ts:259` blocks unverified users from posting, but comment (`social.service.addComment`), react, follow, bookmark have no such check. Registration auto-issues a session cookie pre-verification (`auth.service.ts:128`).
Exploit: throwaway/bot accounts (never verified) freely spam comments, reactions, follows.
Fix: apply a verified-email gate consistently to all content/interaction writes, or drop the post-only gate — pick one policy.

### M4 — Upload pipeline: no throttle, no re-encode, EXIF passthrough
`uploads.controller.ts` — magic-byte sniffing is solid, but: no rate limit (H1), no image re-encoding/resize, original bytes stored to R2 as-is (`r2-upload.service.ts:47`). GIF/animated allowed.
Exploit: authed user uploads unlimited 5MB files → R2 cost abuse; uploaded photos retain GPS/EXIF and are served publicly (`CacheControl: public, max-age=1yr`) → location/PII leak of end users.
Fix: throttle uploads; run `sharp` to re-encode + strip metadata + cap dimensions; per-user quota. R2 keys are UUID (`r2-upload.service.ts:45`) — good, not predictable.

### M5 — /metrics guarded only at nginx (no app-level defense-in-depth)
`app-locations.conf:72` allow/deny protects `/metrics`; the NestJS route (`main.ts:40`) has no guard. If backend port 3066 is reachable directly (Docker network, misconfigured Traefik, port publish), full Prometheus + default node metrics leak.
Fix: add an IP-allowlist/token guard on the app route too.

### M6 — Email-verify token logged in URL
`app.module.ts:45` pino autoLogging logs `req.url`; `GET /api/auth/verify?token=…` (`auth.controller.ts:90`) puts the single-use token in the query string → persisted to Loki/access logs. Redact list only covers auth/cookie headers.
Fix: move token to POST body, or add URL redaction for `/auth/verify`.

## Low
- L1 `bull-board-auth.ts:29` token compare is non-constant-time; Basic-auth password truncates at first `:` (`:24`). Use `crypto.timingSafeEqual`.
- L2 `tracker.service.ts:52` stores raw client IP in `clickLog` with no retention/anonymization (PII). Add TTL/hash.
- L3 `register.dto.ts:17` / `reset-password.dto.ts:8` password has `MinLength(8)`, no MaxLength, no complexity. Add MaxLength (72, bcrypt limit) + basic policy.
- L4 `create-post.dto.ts:34` `images` accept any external `IsUrl` (not restricted to R2 host) → hotlink/tracking-pixel embedding rendered on post pages. Restrict to R2 public URL prefix.
- L5 `users.service.searchUsers:113` uses `contains` ILIKE `%q%` (no index) — sequential scan, unthrottled (H1) → cheap DoS at scale.

## Positive (risk calibration)
- Stored-XSS is mitigated: no backend HTML sanitize, but frontend renders content via React auto-escaping; the only `dangerouslySetInnerHTML` (`[postId]/page.tsx:73`) escapes `<`→`<`. Keep this — do not add a markdown/HTML renderer without sanitization.
- WS gateway correctly replicates tokenVersion+ban revocation (`social.gateway.ts:53-59`).
- Open-redirect laundering defenses in `shopee-url.ts` are thorough (getAll param pollution, nested redirector, userinfo confusion) and well tested.
- `.env` gitignored; only `.env.example` tracked. `JWT_SECRET` via `getOrThrow` (no insecure default).

## Test quality
`security-fixes.spec.ts`, `auth-hardening.spec.ts`, `moderation.spec.ts` are real behavior assertions (enumeration no-op, idempotency, tokenVersion bump, ban rules) — not phantom tests. Gaps: no coverage for upload magic-byte, scraper SSRF, WS revocation, throttle behavior, pagination clamps. Prisma is mocked (acceptable for these unit tests).

## Security readiness for social scale: 5/10
Auth core and moderation are solid, but spam/abuse economics and multi-instance rate limiting are not production-ready for an open social network.
Top 3 risks: (1) H1 unthrottled social write endpoints → spam; (2) H2 per-instance throttler → brute-force at scale; (3) M3/M4 unverified-account + unthrottled uploads → bot content + storage/PII abuse.

## Missing platform-security features (future)
- No session list/selective revoke (only global tokenVersion bump logs out all sessions).
- No 2FA path.
- No admin audit log: ban/unban/deletePost/deleteComment (`admin.service.ts`) leave no trail; only report resolution records `resolvedBy`.
- CSRF posture acceptable: sameSite=lax + no state-changing authenticated GET; verify remains so if new GET mutations are added.

## Unresolved questions
1. Is backend port 3066 ever exposed outside the private network in prod? (Determines M5 severity.)
2. Intended email-verification policy — gate all writes, or posts only? (M3.)
3. Expected instance count behind Traefik? (Confirms H2 impact.)

Status: DONE_WITH_CONCERNS
Summary: No critical breaks, but rate-limiting is largely absent/per-instance and several medium abuse/SSRF/privacy gaps remain for social scale.
Findings: Critical 0, High 3, Medium 6, Low 5.
