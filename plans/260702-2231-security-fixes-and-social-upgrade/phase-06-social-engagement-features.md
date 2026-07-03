---
phase: 6
title: Social Engagement Features
status: completed
priority: P2
dependencies:
  - 5
effort: 2-2.5 days
---

# Phase 6: Social Engagement Features

## Overview

User decision: social-network engagement model instead of star ratings — multi-type reactions (upgrade of Like), bookmark/save, and share. Migrates the existing `likes` table to `reactions` without data loss.

## Requirements

- Functional: 6 reaction types (LIKE, LOVE, HAHA, WOW, SAD, ANGRY — CONFIRMED by user 2026-07-02); one reaction per user per post (changeable); bookmark posts + "Saved" page; share button (native share/copy link) with share counter.
- Non-functional: reaction toggle latency comparable to current like; counters stay reconciliation-safe (extend nightly job).

## Architecture

### 6a. Reactions (Like → Reaction migration)

Schema:
```prisma
enum ReactionType { LIKE LOVE HAHA WOW SAD ANGRY }

model Reaction {
  userId    Int          @map("user_id")
  postId    Int          @map("post_id")
  type      ReactionType @default(LIKE)
  createdAt DateTime     @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@id([userId, postId])
  @@index([postId, type])
  @@map("reactions")
}
// Post: keep likeCount as total-reactions counter (atomic increment/decrement — safe).
```

**[RED TEAM — HIGH, 3 reviewers] DROP the `reactionCounts Json` column.** Read-modify-write on a JSON column loses updates under concurrency (Prisma `$transaction` is READ COMMITTED, no row lock) — two simultaneous reactions clobber each other. It THROWS AWAY the atomic safety `likeCount: { increment: 1 }` already has (social.service.ts:157) and forces a nightly-reconcile crutch for a problem that need not exist. It's also premature: the `@@index([postId, type])` makes per-type aggregate-on-read (`SELECT type, COUNT(*) GROUP BY type`) cheap at current scale. Show top-3 reaction icons by aggregating on read. Add denormalization ONLY if profiling later proves it necessary.

Migration (hand-written SQL): `ALTER TABLE likes RENAME TO reactions`; `ADD COLUMN type` (see enum ordering below); rename indexes AND constraints. Zero data loss; existing likes become LIKE reactions. `likeCount` stays an atomic total-reactions counter.

**[RED TEAM — MEDIUM] RENAME does not rename PK/FK/index constraints.** `ALTER TABLE ... RENAME TO` leaves `likes_pkey`, `likes_user_id_fkey`, `likes_post_id_fkey`, `likes_post_id_idx` (migration `20260621150117...:61,150,198,201`). Prisma then sees drift. Add explicit `ALTER TABLE reactions RENAME CONSTRAINT likes_pkey TO reactions_pkey;` (+ both FKs) and `ALTER INDEX likes_post_id_idx RENAME TO ...`. Verify with `prisma migrate diff --from-schema-datamodel --to-schema-datasource` → ZERO drift (not just "no DROP TABLE").

**[RED TEAM — MEDIUM] Enum-before-column ordering.** `CREATE TYPE "ReactionType"` MUST precede `ALTER TABLE ADD COLUMN type "ReactionType" NOT NULL DEFAULT 'LIKE'`. Verify no row ends NULL.

API (upsert semantics replaces the create/delete pair):
- `PUT /posts/:id/reactions { type }` — upsert; same type again → remove (toggle). Maintain `likeCount` with atomic `{ increment/decrement }` in the same transaction (NO JSON). Block guard: `assertNotBlocked` (Phase 5).
- `GET /posts/:id/reactions/me` (Optional guard) → `{ type: ReactionType | null, counts }` where `counts` is aggregated on read.
- **[RED TEAM — HIGH] `GET /posts/:id/likes/count` currently returns `{count, isLiked}` and is called by `like-button.tsx:37` via `socialApi.likeStatus`.** Its fate must be explicit: replace with `/reactions/me` and migrate the caller, OR keep as an alias. Chosen: migrate `like-button.tsx` → `reaction-button.tsx` and drop the old 3 like endpoints in the same commit (see red-team below on aliases).
- **[RED TEAM — HIGH, scope] NO deprecated REST aliases, NO dual socket events.** There is no mobile app or external client (`apps/` = backend + frontend only) — the "one release transition" protects nothing. Rename atomically: `emitLikeUpdate`→`emitReactionUpdate`, event `'like:update'`→`'reaction:update'`, migrate the single listener (`use-comment-socket.ts:63`) in the same commit. Simpler, no counter double-sync.
- Notification: reuse existing LIKE type (no new NotificationType — notification text says "reacted").

### 6b. Bookmark / Save

```prisma
model Bookmark {
  userId    Int      @map("user_id")
  postId    Int      @map("post_id")
  createdAt DateTime @default(now()) @map("created_at")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@id([userId, postId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("bookmarks")
}
```
- `PUT /posts/:id/bookmark` (toggle, P2002-idempotent like follow), `GET /me/bookmarks?cursor=` (cursor by createdAt+postId).
- No public counter (private feature — YAGNI). No notification.
- Frontend: bookmark icon on post cards/detail; `/saved` page (PROTECTED list in middleware.ts + sidebar nav entry).

### 6c. Share

- `Post.shareCount Int @default(0)` + `POST /posts/:id/share` (public, throttled 30/min/IP) — fire-and-forget counter increment, no log table (YAGNI; ClickLog pattern available later if analytics needed).
- Frontend `share-button.tsx`: `navigator.share` (mobile) fallback clipboard-copy; fires the counter endpoint on action. Display count in the interaction bar.

### 6d. Reconciliation — REWRITE (not "extension")

**[RED TEAM — CRITICAL, 3 reviewers] `reconciliation.service.ts` hard-codes `FROM likes` (lines 60, 65).** After the rename, the nightly cron runs `UPDATE posts ... FROM likes` → `relation "likes" does not exist` → the try/catch (reconciliation.service.ts:45-50) logs and swallows → the WHOLE reconcile dies silently on the first (like) query, so comment/follower/following reconciliation never runs either. This is a required REWRITE bundled with the rename migration in the SAME deploy, not an additive "extension".
- Rewrite both raw queries: `FROM likes` → `FROM reactions`.
- Also audit every `prisma.like` usage (social.service.ts:154,180,186,208) → `prisma.reaction`, and relation fields `User.likes`/`Post.likes` in schema.
- No `reaction_counts` rebuild needed (column dropped). `likeCount` reconciles against `count(reactions)`. Bookmarks/shares need no reconciliation.
- Post-migration verification: grep `FROM likes` and `prisma.like` → 0 results; run `runReconciliation()` manually → no error.

## Related Code Files

- Modify: `packages/database/prisma/schema.prisma` + hand-written migration (rename likes→reactions, Bookmark, shareCount, reactionCounts)
- Modify: `apps/backend/src/social/social.service.ts` (reaction upsert/toggle atomic, bookmark, share; `prisma.like`→`prisma.reaction` x4), `social.gateway.ts` (rename event, no dual-emit), `likes.controller.ts` → `reactions.controller.ts` (NO aliases), new `bookmarks.controller.ts`
- Modify: `apps/backend/src/maintenance/reconciliation.service.ts` (REWRITE `FROM likes`→`FROM reactions`)
- Modify: `apps/backend/src/search/meilisearch.service.ts` + `posts.service.ts` raw queries (`RawPostRow` gains share_count; NO reaction_counts)
- Create: `apps/frontend/src/components/social/reaction-button.tsx` (replaces like-button.tsx; hover/long-press picker), `bookmark-button.tsx`, `share-button.tsx`
- Modify/Delete: `apps/frontend/src/components/social/like-button.tsx` (**[RED TEAM] missed consumer** — migrate to reaction-button; calls socialApi.like/unlike/likeStatus at :26,30,37), `use-comment-socket.ts:63` (**[RED TEAM] missed** — `'like:update'` listener → `'reaction:update'`)
- Create: `apps/frontend/src/app/saved/page.tsx`
- Modify: `apps/frontend/src/lib/api.ts`, `types/index.ts`, `post-card.tsx`, `post-feed-card.tsx`, post detail page, `sidebar-nav.tsx`
- Modify: `apps/frontend/src/middleware.ts` — **[RED TEAM] add `/saved` to BOTH `PROTECTED` (line 5) AND `config.matcher` (lines 43-51)**; matcher gates whether middleware runs at all — PROTECTED-only leaves `/saved` unguarded.
- NOTE read-only `likeCount` consumers safe (unchanged counter): `right-sidebar.tsx:67`, `dashboard/page.tsx:73`.
- Create: `apps/backend/test/social-engagement.spec.ts`

## Implementation Steps

1. Migration: rename table + PK/FK/index constraints + enum-before-column; verify `migrate diff` ZERO drift (not just no DROP TABLE).
2. Backend reactions: upsert/toggle service with ATOMIC likeCount increment/decrement (no JSON); `reactions.controller.ts` (NO aliases); rename gateway event (single `'reaction:update'`); `prisma.like`→`prisma.reaction`.
3. Backend bookmarks + share endpoints (block guard on reaction+bookmark).
4. Reconciliation REWRITE (`FROM likes`→`FROM reactions`) — bundled with migration deploy.
5. Frontend: reaction-button (single-tap = LIKE toggle for muscle memory, picker on hover/long-press) replacing like-button; migrate `use-comment-socket.ts` listener; bookmark button + saved page; share button; `/saved` in PROTECTED + matcher.
6. Verify trending MV unaffected — MV reads `posts.like_count` (no `likes` join); no MV change (confirmed by red-team).
7. Tests: toggle same type removes, switch type keeps count consistent, PARALLEL reactions don't lose updates, bookmark cursor walk, reconciliation runs post-migration, no NULL reaction types.

## Success Criteria

- [ ] Existing likes appear as LIKE reactions post-migration: row counts equal AND `SELECT count(*) FROM reactions WHERE type IS NULL` = 0 AND `SELECT DISTINCT type` = {LIKE}.
- [ ] `prisma migrate diff` shows ZERO drift after migration (PK/FK/index renamed).
- [ ] React → switch type → remove: `likeCount` correct at each step via atomic increment/decrement; concurrent reactions do not lose updates (test with parallel requests, not sequential).
- [ ] `grep 'FROM likes'` and `grep 'prisma.like\b'` → 0 results; `runReconciliation()` runs without error post-migration.
- [ ] `/saved` guarded (unauth → redirect login) AND lists bookmarks newest-first with cursor pagination.
- [ ] Share button increments counter and copies/opens native share.
- [ ] Realtime reaction updates reach open post pages via `'reaction:update'` (single event, listener migrated).
- [ ] `like-button.tsx` fully replaced; no dangling `socialApi.like/likeStatus` calls remain (grep = 0).

## Risk Assessment

- The likes→reactions rename is the riskiest migration in the plan: hand-write SQL (rename table + constraints + indexes, enum-before-column), snapshot backup exists (db-backup service), test on a copy first, verify `migrate diff` zero-drift.
- Deploy atomicity: migration + reconciliation rewrite + service `prisma.like`→`prisma.reaction` MUST ship together (single container `migrate deploy && node main.js`); otherwise nightly reconcile crashes on the renamed table.
- No JSON denormalization → no concurrency drift by construction (atomic counter + read-time aggregate).
- Frontend reaction picker is the largest UI item; fallback ship order: toggle-LIKE parity first, picker enhancement second.
