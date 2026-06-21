# Social Media Review Platform: Architecture Research Findings

**Date:** 2026-06-21 | **Scope:** MVP architecture for Shopee affiliate review platform

---

## 1. Database Schema Patterns

**Recommendation:** Use indexed normalized schema with separate tables for users, posts, follows, likes, comments.

- Create tables: `users`, `posts` (with user_id FK), `follows` (user_id → follower_id many-to-many), `likes`, `comments`
- **Critical:** Don't store "like count" as data; calculate via aggregate queries to maintain consistency
- Add indexes on `user_id`, `post_id`, `created_at` for efficient lookups
- Use timestamps (`created_at`, `updated_at`) on all tables for sorting newsfeed

**Why:** Simple to reason about, Prisma generates clean models, PostgreSQL handles joins efficiently at MVP scale.

---

## 2. Newsfeed Architecture

**Recommendation:** Start with **fan-out-on-write** for MVP, migrate to hybrid if/when creators exceed ~10K followers.

- Fan-out-on-write: When a user posts, push to all follower timelines immediately (precomputed)
- Hybrid approach for scale: For celebrity creators (>10K followers), store posts separately; on read, merge precomputed timeline with live celebrity posts
- For MVP: Simple write operation, fast feed loads, acceptable cost with small-medium user base

**Why:** Easier to implement in NestJS, faster reads for users scrolling feed, scales adequately for 10-100K users.

---

## 3. Real-Time Notifications

**Recommendation:** Use **Server-Sent Events (SSE)** for MVP; reserve WebSockets if you need bidirectional chat later.

- SSE: Simpler HTTP-based one-way push (client receives only), auto-reconnect, works with HTTP/2
- WebSocket: Full-duplex, needed only for interactive features (chat, collaborative editing)
- Hybrid: SSE for notifications (likes, comments, follows), WebSocket later if adding chat

**Why:** SSE reduces implementation complexity, works seamlessly with NestJS/Next.js, no socket.io overhead, cheaper at scale (standard HTTP).

---

## 4. Image Storage

**Recommendation:** **Cloudflare R2** for cost efficiency; local disk only during development.

| Option | Cost (10TB/month) | Egress | Best For |
|--------|-------------------|--------|----------|
| R2 | $15 | $0 | MVP + scaling |
| AWS S3 | $50 + $891 (egress) | $0.09/GB | Enterprise compliance |
| Local disk | Free | N/A | Dev only |

**Why:** R2 eliminates egress fees (S3's hidden cost), S3 prices out at scale for content-heavy apps. Start R2 from day 1, no lock-in.

---

## 5. Full-Text Search

**Recommendation:** Start with **PostgreSQL native full-text search**, migrate to Meilisearch if UX becomes growth lever.

- PostgreSQL FTS: Built-in, transactional consistency, no separate infrastructure
- Meilisearch: When search performance impacts user retention; easier to implement than Elasticsearch
- Elasticsearch: Only if search becomes the primary product feature (not MVP priority)

**Why:** PostgreSQL keeps MVP footprint minimal (NestJS + Prisma already use PG), validates search demand before external tool investment.

---

## 6. Shopee Affiliate Program API

**Limitation:** No public programmatic click-tracking API; limited affiliate link generation (1K/month via Involve Asia).

- Shopee Affiliate Open API: Exists but undocumented for affiliates; uses GraphQL + HMAC-SHA256
- Involve Asia (partner): Allows 1K affiliate link generations/month via API
- SubID tracking: Manually append SubIDs to affiliate links to track campaign performance (Shopee supports this)
- Manual model: For MVP, users provide their own affiliate links; you track clicks via pixel/redirect server with SubID params

**Workaround:** Build internal redirect tracker (e.g., `/track/[postId]` → count + redirect to Shopee). Parse affiliate link SubIDs to attribute sales.

**Why:** Shopee doesn't expose conversion tracking; manual link provision (user brings their own affiliate link) + your click tracker = viable MVP solution.

---

## Summary

| Component | MVP Choice | Rationale |
|-----------|-----------|-----------|
| Database | PostgreSQL + Prisma | Native types, FTS built-in, simple schema |
| Newsfeed | Fan-out-on-write | Fast reads, simple implementation |
| Notifications | SSE | Minimal overhead, suits one-way push |
| Storage | Cloudflare R2 | Cost + simplicity, no egress fees |
| Search | PostgreSQL FTS | Deferred complexity, validates demand |
| Affiliate | Manual links + redirect tracker | Shopee API limitations, user-controlled links |

**Tech Stack Validation:** NestJS + Next.js + Prisma + PostgreSQL + R2 is a pragmatic MVP combination. No external dependencies until metrics demand them.

---

## Unresolved Questions

- What's acceptable latency for newsfeed (should we cache top N posts in Redis)?
- Does Shopee's GraphQL API expose affiliate link generation despite undocumented status?
- Should we support external SSO (Google, Shopee login) or email-only for MVP?
