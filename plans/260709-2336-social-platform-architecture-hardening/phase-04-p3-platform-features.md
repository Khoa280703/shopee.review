---
phase: 4
title: P3 Platform Features
status: planned
priority: P3
dependencies: [3]
effort: 3-4 days (each item independent)
---

# Phase 4: P3 Platform Features

## Overview

Net-new capabilities a real social platform needs but the current app lacks. Each independent; pick by product priority. NOT required for correctness/security baseline (Phases 1-3 cover that) — these are the "chuẩn chỉ MXH" additions.

## Items

### 4a. Session management (list + revoke)
- Today: only global `tokenVersion` bump (kills ALL sessions). No per-device visibility/revoke.
- Add a `Session`/refresh-token record per login (device, IP, lastSeen); settings UI to list active sessions + revoke one. Move to short-lived access token + refresh token if not already.
- Value: security hygiene expected by users; enables "log out other devices".

### 4g. Expanded auth providers (Facebook OAuth + phone/OTP) — user-requested 2026-07-10
Current: email/password + Google only. Google already sets `emailVerified=true` (`auth.service.ts:172`); email/password stays unverified until the email link. User wants more sign-in methods with a unified trust rule.

- **Unified trust rule (encode this):** ANY provider login (Google/Facebook) OR successful phone-OTP ⇒ set the trust flag (`emailVerified`, reused as "account trusted") = true, skip the email-verify link. ONLY email/password signup needs email verification. Keep `emailVerified` as the single trust flag (KISS — don't add a parallel `phoneVerified`/`trusted` unless a real need appears).
- **Facebook OAuth (light):** add a `passport-facebook` strategy mirroring Google (`google.strategy.ts` + `googleLogin` as the template); add `facebookId String? @unique` to User; link by email if an account exists. Same auto-verified treatment.
- **Phone/OTP (heavy — needs budget + abuse controls):**
  - Schema: `phone String? @unique`, an `OtpChallenge` table (phone, codeHash, expiresAt, attempts) or Redis-backed short-TTL codes.
  - SMS provider (Twilio / Vonage / a VN gateway e.g. eSMS) — **costs money per SMS**; store creds as secrets.
  - Flow: request-OTP (strict per-phone + per-IP rate limit to prevent SMS-bombing / cost abuse) → verify-OTP → issue JWT, set trust flag true.
  - Do this only when SMS budget + rate-limit design are settled; phone-OTP is the most abuse-sensitive auth path.
- Account linking: one user may have several of {password, googleId, facebookId, phone}; link by verified email/phone; avoid duplicate accounts.

### 4b. Two-factor auth (TOTP)
- Optional TOTP (authenticator app) + backup codes. Enforce on admin accounts.
- Reuse the verified-email guard pattern for a `@RequireMfa` on sensitive actions if desired.

### 4c. Admin audit log
- Ban/unban/delete-post/delete-comment/resolve-report currently leave no trail.
- Append-only `AdminAuditLog` (actorId, action, targetType, targetId, reason, at). Surface in `/admin`. Essential for moderation accountability at scale.

### 4d. Feed fanout-on-write for active users (measured, not premature)
- Current pull-model feed (`WHERE EXISTS` over follows) is fine now; degrades as the social graph grows + high-follow accounts appear.
- Incremental path (do ONLY when profiling shows pain): precompute feed cache (`feed:{userId}` list) via the existing BullMQ fanout for ACTIVE users; keep pull-model for inactive/long-tail. Hybrid — avoid full fanout-on-write for everyone (write amplification on celebrity accounts).
- Gate: add feed-latency metric first; implement when p95 crosses a threshold.

### 4e. SEO / Open Graph for shared posts (growth loop)
- Social platforms grow via shared links. Verify each post-detail + profile page emits correct `<title>`, description, OG/Twitter card tags, canonical URL, and that these are server-rendered (crawlable).
- Post-detail should be ISR/SSR with per-post metadata + OG image (static or generated). Add `sitemap.ts`/`robots.ts` coverage for public posts (partially present — audit).

### 4f. Notification write-amplification mitigation (popular users)
- `NEW_POST` fanout = 1 row per follower. For high-follower accounts this is heavy on write.
- Options: batch/coalesce, or pull-model for very-high-follower authors (compute notification on read). Tie to 4d's active/inactive split.

## Related Code Files

- Create: `Session`, `AdminAuditLog` models + migrations; MFA fields on User
- Create: `apps/backend/src/auth/session.*`, `mfa.*`; `apps/backend/src/moderation/audit.*`
- Modify: `apps/frontend/src/app/settings/*` (sessions, MFA), `admin/*` (audit view), post-detail metadata
- Modify: feed/notification services for hybrid fanout (4d/4f)

## Success Criteria

- [ ] User can see + revoke individual sessions; revoke kills only that session.
- [ ] TOTP enrollable; admin login requires it.
- [ ] Every admin moderation action recorded + visible.
- [ ] Shared post link renders correct OG card (validate via a card debugger).
- [ ] Feed p95 latency tracked; fanout path proven on a load test before rollout.

## Risk / Rollback

- Session/refresh-token change touches the whole auth flow — largest blast radius here; do behind a feature flag, migrate carefully (existing cookie sessions must keep working during transition).
- Fanout-on-write adds eventual-consistency complexity — only adopt with metrics justifying it; keep pull-model as fallback.
- Each item is independent and individually revertable; ship one at a time.
