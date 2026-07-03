---
phase: 3
title: Auth Session Hardening
status: completed
priority: P1
dependencies: []
effort: 1 day
---

# Phase 3: Auth Session Hardening

## Overview

Add JWT revocation via `tokenVersion`, expiry for email-verify tokens, and fix the hardcoded FollowButton state on the post detail page. One Prisma migration.

## Requirements

- Functional: password reset/change invalidates all existing sessions; verify links expire after 24h; FollowButton reflects real follow state.
- Non-functional: no extra DB query per request (JwtStrategy already loads the user row — reuse it).

## Architecture

### 3a. JWT revocation via tokenVersion

Current state: 30-day JWT in HttpOnly cookie (`auth.service.ts:25`), no revocation — a stolen token survives password reset. `jwt.strategy.ts:30` already queries the user per request, so version checking is free.

- Schema: `User.tokenVersion Int @default(0) @map("token_version")`.
- `setAuthCookie` signs `{ sub, username, ver: user.tokenVersion }`.
- `JwtStrategy.validate`: `payload.ver !== user.tokenVersion` → UnauthorizedException. Treat missing `ver` (legacy tokens) as version 0 so existing sessions survive the deploy.
- Bump `tokenVersion` (increment) in: `resetPassword`, `changePassword` (new — see 3d), and ban (Phase 5 reuses this).
- After `resetPassword` bump, the reset flow response should prompt re-login (frontend already redirects to login — verify).
- Next.js `middleware.ts` only verifies signature+exp (edge, no DB) — acceptable: page-gate only; API calls still hit the versioned check. Document this boundary in code comment.

**[RED TEAM — HIGH] Socket.io gateway bypasses JwtStrategy entirely.** `social.gateway.ts:41` calls `this.jwt.verify(token)` directly — no DB load, no `tokenVersion`, no `bannedAt` check. So a revoked/banned user keeps a valid WebSocket. The "single choke point in JwtStrategy" claim (also in Phase 5) is false for WS. Fix: in `handleConnection`, after `jwt.verify`, load the user and reject (disconnect) if `ver` mismatches `tokenVersion` or `bannedAt` is set. This couples Phase 3 + Phase 5 ban semantics — implement the user-load check here once.

**[RED TEAM — HIGH] AuthUser leaks new fields — `sanitize()`/`omit` are DENYLISTS.** `auth.service.ts:48` `sanitize()` spreads `...rest` removing only `passwordHash`+`verifyToken`; `jwt.strategy.ts:32` `omit` likewise. Every new User column auto-flows into `/auth/me`, register, login responses. Today `resetToken`/`resetTokenExp` already leak. After this phase, `tokenVersion`/`verifyTokenExp` would leak; after Phase 5, `bannedAt`. Fix: add `tokenVersion`, `verifyTokenExp`, `resetToken`, `resetTokenExp` to BOTH `sanitize` and `omit`. `isAdmin` (Phase 5) is intentionally exposed (client-side admin gate) — document that. Strongly consider converting AuthUser to an allowlist `select` (like `PUBLIC_PROFILE_SELECT`, users.service.ts:6) to make this fail-safe.

**[RED TEAM — MEDIUM → USER DECISION] Legacy `ver ?? 0` grace = 30-day revocation immunity.** A token stolen before deploy (no `ver` claim → treated as 0) would stay valid up to 30 days if the victim never resets. **DECISION: force a one-time global `tokenVersion` bump on release** (migration sets all existing users' `token_version` to 1, or a startup one-shot) so every pre-deploy token is invalidated immediately — all users re-login once (0 users now, so negligible). This closes the window entirely; the `ver ?? 0` legacy handling remains only as defensive code.

### 3b. Verify-token expiry

`verifyToken` has no expiry (vs `resetTokenExp` which does). Add `verifyTokenExp DateTime?`; set +24h at registration; `verifyEmail` rejects expired tokens; add "resend verification email" endpoint since expired tokens now need a refresh path. Frontend: button on `/auth/verify` error state.

**[RED TEAM — MEDIUM] Per-IP throttle alone is broken + email-bomb vector.** Per-IP throttle relies on `trust proxy` (fixed in Phase 1b) — until then all IPs collapse to one bucket. Even after: resend takes an arbitrary email in the body and mails a registered-but-unverified victim. Add a per-EMAIL cooldown (e.g. 1 resend / 5 min / email) IN ADDITION to per-IP, AND do not regenerate the token if the current one is still valid (re-send the existing token) — otherwise an attacker invalidates the victim's valid link repeatedly. Keep silent-success (no enumeration).

### 3d. Change-password endpoint (new — was missing)

**[RED TEAM — MEDIUM] Acceptance criterion "password change invalidates old sessions" references a non-existent flow.** `auth.controller.ts` has no change-password endpoint (only reset). Add `POST /auth/change-password` (JwtAuthGuard; body: currentPassword + newPassword; verify current via bcrypt; on success bump `tokenVersion` → all other sessions die). Throttle per-user. Frontend: form in `/settings`. This closes the acceptance-criterion gap rather than deleting the criterion.

### 3c. FollowButton real state on post detail

`[postId]/page.tsx:86` hardcodes `initialFollowing={false}`. Server components don't forward auth cookies to the API (`api.ts` server fetch is cookie-less), so resolve client-side:
- Add `GET /users/:username/follow-status` → `{ following: boolean }` (OptionalJwtAuthGuard; anonymous → false). Note: `users.service.findByUsername` already computes `isFollowing` — extract a tiny `followStatus()` method reusing that query.
- `FollowButton`: when `user` is logged in and no server-provided state, `useQuery(['followStatus', username], () => socialApi.followStatus(username))` fetches real state. Profile page (`user-profile-header.tsx:34`) keeps passing the server value.

**[RED TEAM — HIGH] Just swapping the queryFn does NOT work.** Current `follow-button.tsx:23-28` sets `initialData: initialFollowing` + `staleTime: Infinity` → react-query treats it as permanently fresh and NEVER calls queryFn. On post-detail (`initialFollowing={false}`) the button stays "Theo dõi" even when following. Fix: only set `initialData` when a server value is actually provided (profile page); on post-detail, OMIT `initialData` and use `enabled: !!user` + a finite `staleTime` so the queryFn actually runs. Do NOT drop `initialData` unconditionally — the profile header depends on it.

## Related Code Files

- Modify: `packages/database/prisma/schema.prisma` (tokenVersion, verifyTokenExp) + new migration
- Modify: `apps/backend/src/auth/auth.service.ts` (sign ver, bump on reset+change, verify expiry, resend logic, changePassword; extend `sanitize()` denylist)
- Modify: `apps/backend/src/auth/auth.controller.ts` (POST /auth/resend-verification + /auth/change-password, throttled per-IP+per-user)
- Modify: `apps/backend/src/auth/strategies/jwt.strategy.ts` (version check; extend `omit`)
- Modify: `apps/backend/src/social/social.gateway.ts` (load user + check ver/bannedAt on WS connect)
- Modify: `apps/backend/src/users/users.controller.ts` + `users.service.ts` (follow-status endpoint)
- Modify: `apps/frontend/src/components/social/follow-button.tsx` (conditional initialData + real status query)
- Modify: `apps/frontend/src/lib/api.ts` (followStatus, resendVerification, changePassword)
- Modify: `apps/frontend/src/app/auth/verify/page.tsx` (resend button), `apps/frontend/src/app/settings/page.tsx` (change-password form)
- Create: `apps/backend/test/auth-hardening.spec.ts`

## Implementation Steps

1. Migration: `token_version` (default 0), `verify_token_exp`.
2. AuthService: include `ver` claim; increment on `resetPassword`; set `verifyTokenExp` on register; check expiry in `verifyEmail`; `resendVerification(email)` regenerates token+exp (silent success for unknown/already-verified emails — no enumeration).
3. JwtStrategy: compare `payload.ver ?? 0` with `user.tokenVersion`.
4. Backend follow-status endpoint (reuse existing follow lookup).
5. Frontend FollowButton queryFn + api client; keep optimistic-update logic intact.
6. Tests: version mismatch → 401; legacy token (no ver) + version 0 → OK; reset password → old token rejected; expired verify token → error; resend flow.

## Success Criteria

- [ ] Login → reset password → old cookie/token gets 401 on `/api/auth/me`.
- [ ] Login → change password (with current) → other sessions get 401.
- [ ] Existing pre-deploy tokens (no `ver` claim) still work until reset (or forced global bump, if chosen).
- [ ] `/auth/me` response does NOT contain `tokenVersion`, `verifyTokenExp`, `resetToken`, `resetTokenExp` (only `isAdmin` intentionally exposed).
- [ ] Banned/revoked user's WebSocket connection is rejected (gateway user-load check).
- [ ] Verify link older than 24h → clear error + resend works; resend re-sends existing valid token, cooldown per-email enforced.
- [ ] Post detail page shows "Đang theo dõi" when already following (queryFn actually runs).
- [ ] No additional DB queries per authenticated request in the HTTP path (strategy still 1 query).

## Risk Assessment

- Deploy ordering: migration must run before new code signs `ver` claims — existing `migrate deploy` on container start handles this (same container).
- Legacy-token grace (missing ver → 0) means revocation only fully applies to tokens issued post-deploy; acceptable, self-heals within the 30-day cookie window.
- Resend endpoint is an email-send vector → strict throttle (3/15min per IP) + silent success.
