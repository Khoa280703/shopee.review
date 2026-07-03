---
phase: 5
title: Moderation System
status: completed
priority: P1
dependencies:
  - 3
effort: 2 days
---

# Phase 5: Moderation System

## Overview

Full moderation per user decision: content reporting, admin role with delete/ban powers, user-to-user blocking. Largest schema change of the plan (Report, Block models; User gets isAdmin/bannedAt).

## Requirements

- Functional: any user reports posts/comments/users; admins list+resolve reports, delete any content, ban/unban accounts; users block others (mutual invisibility of content interactions).
- Non-functional: block-filtering must not regress feed/comment query performance; banned users are dead-stopped at auth layer (no per-endpoint checks).

## Architecture

### Schema (one migration)

```prisma
enum ReportReason { SPAM SCAM OFFENSIVE FAKE OTHER }
enum ReportStatus { PENDING RESOLVED DISMISSED }
enum ReportTargetType { POST COMMENT USER }

model Report {
  id          Int      @id @default(autoincrement())
  reporterId  Int      @map("reporter_id")
  targetType  ReportTargetType @map("target_type")
  targetId    Int      @map("target_id")   // post/comment/user id per targetType
  reason      ReportReason
  detail      String?  @db.VarChar(500)
  status      ReportStatus @default(PENDING)
  resolvedBy  Int?     @map("resolved_by")
  createdAt   DateTime @default(now()) @map("created_at")
  reporter    User     @relation("Reporter", fields: [reporterId], references: [id], onDelete: Cascade)
  @@unique([reporterId, targetType, targetId])  // idempotent reporting
  @@index([status, createdAt])
  @@map("reports")
}

model Block {
  blockerId Int @map("blocker_id")
  blockedId Int @map("blocked_id")
  createdAt DateTime @default(now()) @map("created_at")
  blocker User @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)
  @@id([blockerId, blockedId])
  @@index([blockedId])
  @@map("blocks")
}

// User additions:
//   isAdmin  Boolean @default(false) @map("is_admin")
//   bannedAt DateTime? @map("banned_at")
```

`targetId` is intentionally polymorphic (no FK) — deleted targets keep report history; service validates existence at creation. KISS over 3 nullable FKs.

**[RED TEAM — MEDIUM] Existence validation is an enumeration oracle.** Different responses for "target exists" vs "not found" let an attacker probe hidden/banned content via the report endpoint, and POST-type reports carrying a COMMENT id are only safe with exact per-type lookup logic. Fix: return an identical response regardless of whether the target exists/is visible (accept the report row optimistically, or 202 uniformly); do the per-type visibility check server-side without leaking the result to the reporter. Build a `targetType × lookup` matrix so a POST report can't reference a comment id.

### Ban semantics (rides on Phase 3)

- `JwtStrategy.validate`: `user.bannedAt` → UnauthorizedException("Tài khoản đã bị khóa"). Covers all authenticated HTTP endpoints. **[RED TEAM — HIGH] NOT a single choke point — WebSocket bypasses it.** `social.gateway.ts:41` verifies tokens directly. Phase 3 adds the ban+ver check on WS connect; this phase's ban action must rely on that (do not claim JwtStrategy alone covers WS).
- Admin ban action also increments `tokenVersion` → live sessions die instantly.
- Banned users' content stays visible (soft policy; admin deletes explicitly). Public profile of banned user → 404 (`findByUsername` filters `bannedAt: null`).
- Self-ban and banning another admin → 400.

### Block semantics (scoped, pragmatic)

Full bidirectional content invisibility in every list query is a perf trap. Scope for this phase:
- Blocked user CANNOT INTERACT: follow you (existing follow auto-removed both directions at block time), comment, react, or bookmark your posts, view your profile via API (`findByUsername` with viewerId → 404).
- Blocked user CAN still READ public content (post-detail direct URL, explore, trending, search). **[RED TEAM — HIGH] This is deliberate — do NOT advertise block as "invisible".** Reading public posts cannot be prevented (they can log out). The security guarantee is: no INTERACTION from a blocked user. `assertNotBlocked` MUST guard ALL write surfaces — comment-create, follow, AND the Phase 6 reaction + bookmark endpoints (originally missed). UI copy for block must say "họ không thể tương tác với bạn", not "họ không thấy bạn".
- Feed filter: exclude blocked-either-direction authors (feed cache is per-user `feed:${userId}`, so filtering is cache-safe). Explore/trending/search use SHARED cache keys (`explore:${categoryId}:${offset}:${limit}`, verified posts.service.ts:185) so per-viewer filtering there would break the shared cache — left unfiltered by design, documented.
- New `BlocksService.assertNotBlocked(viewerId, authorId)` guard used in comment-create, follow, reaction, bookmark.
- Feed: add `AND author NOT IN (SELECT blocked/blocker pairs)` — one extra EXISTS subquery, indexed by PK/[blockedId].

### Admin surface

- Guard: `AdminGuard` (after JwtAuthGuard) checks `user.isAdmin`.
- `admin.module.ts` endpoints: `GET /admin/reports?status=`, `PATCH /admin/reports/:id` (resolve/dismiss), `DELETE /admin/posts/:id`, `DELETE /admin/comments/:id`, `POST /admin/users/:id/ban`, `POST /admin/users/:id/unban`.
- **[RED TEAM — MEDIUM] Do NOT add a `skipOwnershipCheck` boolean to `PostsService.remove`/`SocialService.deleteComment`.** Boolean-trap: any caller passing `true` (or wrong positional arg) silently disables the ownership check → IDOR. `remove(userId, postId)` and `deleteComment(userId, commentId)` gate via `post.userId !== userId → Forbidden` (posts.service.ts:303, social.service.ts:325). Instead extract the shared deletion side-effects (counter decrement, search-index delete, gateway emit) into a private helper, and add SEPARATE `adminRemovePost(postId)` / `adminDeleteComment(id)` methods callable only from `admin.service.ts` (already behind `AdminGuard`). No bypass flag on the ownership-gated methods.
- **First admin — env-driven bootstrap (DECIDED 2026-07-02, replaces manual SQL).** On backend startup, an `AdminBootstrapService` (`OnModuleInit`) reads `ADMIN_BOOTSTRAP_USERNAME` (comma-separated allowed); for each username that exists, ensure `is_admin=true` (idempotent — no-op if already admin, warns if user not found yet). Rationale: no manual SQL to forget, repeatable across fresh deploys, works in Docker. No self-promotion UI/endpoint. Add `ADMIN_BOOTSTRAP_USERNAME` to `.env.example` + docker-compose backend env.
- Frontend `/admin` page (isAdmin-gated client-side + server 403): reports table with resolve/dismiss/delete/ban actions. Reserved-username list already contains `admin` — route is safe from username collision (verify in `reserved-usernames.ts`).

### User-facing UI

- Report: dropdown-menu item on post cards + comments + profile ("Báo cáo") → reason modal.
- Block: profile action ("Chặn người dùng") + settings list of blocked users with unblock.

## Related Code Files

- Modify: `packages/database/prisma/schema.prisma` + migration
- Create: `apps/backend/src/moderation/moderation.module.ts`, `reports.controller.ts`, `reports.service.ts`, `blocks.controller.ts`, `blocks.service.ts`, `admin.controller.ts`, `admin.service.ts`, `admin.guard.ts`, `admin-bootstrap.service.ts` (env-driven first admin), `dto/create-report.dto.ts`
- Modify: `.env.example`, `docker-compose.yml` (`ADMIN_BOOTSTRAP_USERNAME`)
- Modify: `apps/backend/src/posts/posts.service.ts` (extract deletion helper + `adminRemovePost`), `apps/backend/src/social/social.service.ts` (extract + `adminDeleteComment`; block guard in comment-create)
- Modify: `apps/backend/src/auth/strategies/jwt.strategy.ts` (bannedAt check)
- Modify: `apps/backend/src/social/social.service.ts` (comment-create block guard; admin delete path)
- Modify: `apps/backend/src/posts/posts.service.ts` (admin delete path)
- Modify: `apps/backend/src/feed/feed.service.ts` (block filter)
- Modify: `apps/backend/src/users/users.service.ts` (banned/blocked profile 404)
- Modify: `apps/backend/src/app.module.ts` (ModerationModule)
- Create: `apps/frontend/src/app/admin/page.tsx`, `apps/frontend/src/components/moderation/report-dialog.tsx`, `block-button.tsx`
- Modify: `apps/frontend/src/lib/api.ts` (moderationApi), settings page (blocked list), post card/comments (report menu)
- Create: `apps/backend/test/moderation.spec.ts`

## Implementation Steps

1. Migration: Report, Block, User.isAdmin/bannedAt.
2. Backend: ReportsService (create idempotent via @@unique catch P2002, target-existence validation), BlocksService (block/unblock + auto-unfollow both directions in one transaction, list), AdminService (reports list/resolve, delete delegations, ban = set bannedAt + increment tokenVersion, unban).
3. Wire guards: AdminGuard; bannedAt check in JwtStrategy; block guard in comments/follows; feed filter; profile 404s.
4. Frontend: report dialog, block button + settings blocked list, /admin reports table.
5. Tests: report idempotency, ban kills live token, block prevents comment/follow + hides feed content, admin delete cascades counters correctly, non-admin → 403.

## Success Criteria

- [ ] Report same target twice → single row, 200 both times.
- [ ] Banned user: all API calls → 401 immediately (live session killed); profile 404.
- [ ] Blocked user cannot comment/follow; their feed lacks blocker's posts.
- [ ] Admin deletes any post/comment → counters + search index consistent (reuse existing side-effect paths).
- [ ] Non-admin hitting /admin/* → 403; /admin page hidden without isAdmin.
- [ ] Setting `ADMIN_BOOTSTRAP_USERNAME` + restart → that user becomes admin; unset/absent user → warn, no crash; already-admin → no-op.

## Risk Assessment

- Feed block-filter subquery: measure with EXPLAIN before/after; blocks table is tiny in practice, indexed both directions.
- Polymorphic targetId can dangle after content deletion — accepted (report history), admin UI must handle "target deleted" gracefully.
- Explore/trending intentionally unfiltered for blocks — document in code + changelog to preempt "bug" reports.
