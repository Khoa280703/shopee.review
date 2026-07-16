# Architecture · UX · Scalability Assessment — shopee.review

Date: 2026-07-16. Question answered: is the architecture sound/optimal, is the UI/UX good enough for a social network, can it handle moderate load? Method: 2 focused senior reviewers (distributed-systems architect; UI/UX for social) + controller verification. This is an ASSESSMENT (no code changed).

## One-line verdict

**Backend/architecture: sound and launch-ready (~20k DAU comfortably) — quality above typical MVP.** **UI/UX: high-quality MVP foundation but NOT yet social-network grade (~6.5/10)** — the "come back / feel alive" loops are missing. The gap to a real social platform is UX, not architecture.

---

## A. Architecture & scalability — sound

Design choices are correct for the target scale and come with self-correcting machinery (reconciliation, retention, graceful degradation) — genuinely above-average engineering.

**Correct, do NOT over-engineer:** pull-based feed (not fanout), denormalized counters + nightly reconciliation, trending materialized view (REFRESH CONCURRENTLY every 5 min, Redis-locked), modular monolith. No Kafka / read-replicas / sharding / partitioning needed now.

**Scalability ceiling (concrete):**
- **~1k DAU** — everything idle; nginx 2s microcache absorbs anonymous spikes.
- **~10k DAU** — fine on Postgres/indexes; first pressure is the shared 512mb Redis, then pgBouncer's 10 server slots under a slow query.
- **~100k DAU** — breaks in this order: (1) single Node process (one event loop + tens of thousands of SSE/WS conns, ~300–800 rps CPU-bound) → (2) Redis 512mb OOM → (3) pgBouncer pool 10 → (4) Postgres write load (click tracking + notif fanout). **The pull-feed is NOT the first thing to break** — with a composite index it survives past 100k DAU.

**Real pre-scale risks (not perf-premature):**
1. **Backup RPO 24h** (`db-backup` @daily) — the only *must-fix-before-launch*; losing 24h of user content is an unrecoverable reputation hit. Fix: WAL archiving to R2 (wal-g/pgBackRest; R2 already configured).
2. **Single Redis 512mb noeviction across 5 roles** (cache + BullMQ + Socket.io + SSE + throttler) — a read spike filling memory makes `queue.add` fail → scrape/email/fanout/index die. Fix: split into 2 instances (cache+throttler = allkeys-lru; queue+locks+pubsub = noeviction). ~2 URLs + compose.
3. **pgBouncer sizing + a wrong comment I introduced** (docker-compose.yml:110-112): `connection_limit=15` vs `DEFAULT_POOL_SIZE=10` — effective DB concurrency is 10, and my comment "15 stays under 10" is nonsense. Fix: raise pool to ~25, align, correct the comment.
4. Missing composite index `posts(user_id, id DESC)` for the feed semi-join (matters ~500k–1M posts).
5. Unread notifications never pruned (retention only prunes read ones) — slow-growing; prune unread after ~90d.

**Multi-instance readiness is real** (not a claim): Redis NX locks on every cron, SSE via Redis pub/sub, Socket.io Redis adapter, Redis throttler — so horizontal scale is a compose change, not a rewrite. Running 2 backend replicas behind nginx is the real ceiling-raiser (~30-50k DAU).

---

## B. UI/UX — MVP-grade, not yet social-network-grade (6.5/10)

Technical UX foundation beats typical MVPs (optimistic updates, SSE realtime, infinite scroll, skeletons, error-vs-empty distinction, consistent M3 tokens). But it "feels like a review site with a like button, not a social network" — no retention hooks, unconfirmed actions, no new-user guidance, mobile reactions broken.

**Highest-impact gaps (mostly low effort):**
1. **No unread notification badge anywhere** — `useNotifications` already has `unreadCount` + SSE; just render it on the bell (mobile-nav/sidebar/header). The single most important come-back hook, unused.
2. **Notification click goes to the actor's profile, not the post** (`notifications/page.tsx:90`) — LIKE/COMMENT should open the post.
3. **No toast system** — share "copied to clipboard" gives no feedback; bookmark errors revert silently. Also comment-LOAD failure still masked as "no comments" (`comments-section.tsx:138`).
4. **Only one loading.tsx** (category) — home/profile/post navigation can hang blank. (Note: root loading.tsx was intentionally removed to keep hard-404 on invalid post ids; the fix is route-group-scoped loading files, not a root one.)
5. **Empty states are dead ends** — feed/search/profile empty screens have text but no CTA ("Explore", "Find people"). No post-signup onboarding / follow suggestions.
6. **6-type reactions are desktop-only** — picker opens on `onMouseEnter`; mobile (most social traffic) only gets LIKE. Needs long-press + bigger touch targets.
7. **Mobile IA holes** — `/feed` (following), `/saved`, `/dashboard` have NO mobile entry point (sidebar is `lg:` only). For an affiliate product, burying the earnings Dashboard on mobile kills creator motivation.

**Medium:** "+N images" indicator + lightbox (dead `image-carousel.tsx` exists), follower/following counts not clickable, fake "Follow" link in right-sidebar suggestions, affiliate disclosure missing (trust + legal), reviewer's own star rating absent + JSON-LD missing `reviewRating`, no `focus-visible` ring anywhere (keyboard a11y), no dark mode (M3 tokens already support it).

---

## Recommended sequencing

- **Before public launch (small):** backup/WAL to R2 (A1); UX #1 badge, #2 notif link, #3 toast + unmask comment-load error, #5 empty-state CTAs; fix pgBouncer comment+sizing (A3).
- **Before growth (medium):** Redis split (A2); mobile reaction long-press + touch targets (UX #6); mobile IA for feed/saved/dashboard (UX #7); images "+N"/lightbox.
- **Growth phase:** onboarding/follow-suggestions, dark mode, 2 backend replicas, composite feed index.

## Unresolved questions (need your decision)
1. "Trang chủ" (explore) vs "Bảng tin" (following) — keep as separate pages or merge into two tabs on one screen (industry norm)?
2. Should reviewers give their own star rating (pros/cons, score)? Affects backend schema.
3. Affiliate disclosure — which specific VN legal requirement are we targeting?
4. Dark mode — in scope for launch or growth phase?
