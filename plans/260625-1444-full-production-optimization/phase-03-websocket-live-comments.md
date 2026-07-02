---
title: "Phase 3 — WebSocket Live Comments (Socket.io + Redis adapter)"
phase: 3
group: B
priority: P1
status: completed
effort: 12h
depends_on: [1]
blocks: [7]
created: 2026-06-25
---

# Phase 3 — WebSocket Live Comments

## Context Links
- Research: `research/researcher-01-backend-infra.md` (Topic 2 Socket.io + Redis adapter + Next.js client)
- Scout: `social.service.ts` (comments/likes/follows), `comments-section.tsx` uses `use-comment-polling.ts` (18s polling).

## Overview
- **Priority:** P1
- **Status:** completed
- Replace 18s comment polling with Socket.io rooms (`post:{postId}`). Live `comment:new` and `like:update` events. Redis adapter so all NestJS instances broadcast cluster-wide.

## Key Insights
- JWT auth in handshake (`socket.handshake.auth.token`); disconnect on invalid.
- Service methods emit AFTER DB commit (`addComment`, `likePost`).
- Frontend socket MUST be a singleton (provider at root layout) — not per component.
- Optimistic comment insert + dedup by comment ID prevents double render when the broadcast echoes back.

## Requirements
**Functional**
- Client connects once, joins `post:{postId}` on viewing a post, leaves on navigate away.
- New comment from anyone appears live for all room members.
- Like count updates live via `like:update`.

**Non-functional**
- Redis adapter active (Phase 1 Redis) for multi-instance broadcast.
- Reconnection with backoff; graceful when no JWT (anonymous read still works via existing REST + initial SSR).

## Architecture
```
Client (singleton socket) --auth.token--> PostsGateway (JWT verify)
  emit join-post {postId} -> client.join(`post:${postId}`)
SocialService.addComment() -> save DB -> gateway.server.to(room).emit('comment:new', dto)
SocialService.likePost()   -> save DB -> emit('like:update', {postId, likeCount})
All instances share rooms via @socket.io/redis-adapter (pub/sub on Redis)
```

## Related Code Files
**Create (backend)**
- `apps/backend/src/posts/posts.gateway.ts` — gateway, JWT validate, join/leave, inject into module.
- (optional) `apps/backend/src/posts/ws-jwt.util.ts` — handshake token verify helper.

**Create (frontend)**
- `apps/frontend/src/lib/socket.ts` — singleton socket factory.
- `apps/frontend/src/components/providers/socket-provider.tsx` — context provider (client component).
- `apps/frontend/src/components/social/use-comment-socket.ts` — replaces polling hook.

**Modify**
- `apps/backend/src/social/social.service.ts` — emit after addComment/likePost (inject gateway).
- `apps/backend/src/posts/posts.module.ts` (or social.module) — provide PostsGateway.
- `apps/backend/src/main.ts` — `useWebSocketAdapter(RedisIoAdapter)` (coordinate with P2 which also edits main.ts; sequence).
- `apps/frontend/src/app/layout.tsx` — wrap children in SocketProvider (coordinate with P4 which also edits layout.tsx; sequence — nest providers).
- `apps/frontend/src/components/social/comments-section.tsx` — use `use-comment-socket` instead of `use-comment-polling`.
- Delete usage of `use-comment-polling.ts` (keep file or remove after migration).

## Implementation Steps
1. Backend install: `@nestjs/websockets @nestjs/platform-socket.io socket.io @socket.io/redis-adapter`.
2. Create `RedisIoAdapter` (extends IoAdapter) wired to `REDIS_URL` pub/sub clients; register in `main.ts` via `useWebSocketAdapter`.
3. Create `PostsGateway` with `@WebSocketGateway({ cors: { origin: FRONTEND_URL, credentials: true } })`:
   - `handleConnection`: verify JWT from handshake, set `client.data.userId`, else `disconnect()`.
   - `@SubscribeMessage('join-post')` / `('leave-post')`.
4. Inject PostsGateway into `social.service.ts`; after `addComment` DB write, `server.to(`post:${postId}`).emit('comment:new', commentDto)`; after `likePost`, emit `like:update`.
5. Frontend install: `socket.io-client`.
6. `lib/socket.ts`: singleton `io(NEXT_PUBLIC_API_URL, { auth:{token}, transports:['websocket'], reconnection:true })`, returns existing instance if present.
7. `socket-provider.tsx`: init socket in `useEffect` (browser only), expose via context, disconnect on unmount.
8. `use-comment-socket.ts`: on mount emit `join-post`; listen `comment:new` (dedup by id), `like:update`; cleanup emits `leave-post` + `off`.
9. `comments-section.tsx`: swap polling hook for socket hook; keep optimistic insert, dedup incoming by comment id.
10. Wrap `layout.tsx` body with `<SocketProvider>` (nest inside/around QueryProvider from P4).
11. Test: two browsers on same post; comment in one appears live in other; like count syncs.

## Todo List
- [ ] Install backend WS + redis-adapter deps
- [ ] RedisIoAdapter + main.ts wiring
- [ ] PostsGateway (JWT, join/leave)
- [ ] social.service emits (comment:new, like:update)
- [ ] Frontend socket.io-client install
- [ ] lib/socket.ts singleton
- [ ] socket-provider.tsx
- [ ] use-comment-socket.ts (dedup)
- [ ] comments-section.tsx migration
- [ ] layout.tsx provider wrap
- [ ] Two-client live test

## Success Criteria
- New comment broadcasts live (<1s) to all room members across instances.
- Like count updates live.
- Single socket connection per user tab (verify in devtools Network/WS).
- No duplicate comment render after optimistic insert.

## Risk Assessment
- **main.ts shared with P2** → P3 adds WS adapter, P2 adds Bull Board middleware; sequence edits.
- **layout.tsx shared with P4** → nest providers (QueryProvider > SocketProvider); coordinate.
- **Double render** → dedup by comment id in `use-comment-socket`.
- **Anonymous users** → gateway allows connect-without-emit or skips; ensure read path unaffected.

## Security Considerations
- JWT verified on handshake; reject invalid tokens.
- CORS origin pinned to FRONTEND_URL.
- Do not emit private fields (only public comment/author dto).

## Next Steps
- Phase 7 Nginx must proxy `/socket.io` with Upgrade headers + long timeout.
