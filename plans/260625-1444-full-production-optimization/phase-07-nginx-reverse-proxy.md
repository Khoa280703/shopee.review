---
title: "Phase 7 — Nginx Reverse Proxy (rate limit, WS, compression, security)"
phase: 7
group: E
priority: P2
status: completed
effort: 6h
depends_on: [3]
blocks: []
created: 2026-06-25
---

# Phase 7 — Nginx Reverse Proxy

## Context Links
- Research: `research/researcher-02-frontend-infra.md` (Section 3: WS proxy, rate limiting, microcache, security headers, compression)
- Depends on Phase 3 (Socket.io path `/socket.io` must be proxied with Upgrade headers).

## Overview
- **Priority:** P2
- **Status:** completed (gzip; brotli noted as optional custom-image upgrade)
- Nginx becomes the single entrypoint in front of Next.js (frontend) and NestJS (backend). Adds per-endpoint rate limiting, WebSocket upgrade proxying, gzip+brotli, security headers, 2s microcache for hot GETs.

## Key Insights
- WS proxy needs `proxy_http_version 1.1` + `Upgrade`/`Connection "upgrade"` + long `proxy_read_timeout 86400s` + `proxy_buffering off`.
- Rate-limit zones: api=10r/s, auth=5r/m, upload=2r/s, ws=100r/s.
- Microcache 2s on hot GETs (feed, post detail) reduces backend load; bypass for authed/personalized via cache key including user cookie.
- Single server → no sticky-session concern; if scaled later, `ip_hash`.

## Requirements
**Functional**
- Route `/` + static → Next.js; `/api` → NestJS; `/socket.io` → NestJS WS.
- Rate limiting applied per zone with burst.
- Gzip + Brotli for text assets.

**Non-functional**
- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- Microcache 2s for whitelisted GETs only.

## Architecture
```
Client --443--> Nginx
  / , *.js/css/img            -> next:3000
  /api/*                      -> nest:3001 (rate-limited per zone)
  /socket.io                  -> nest:3001 (WS upgrade, 86400s timeout)
  microcache 2s on GET /api/feed, /api/posts/:id
```

## Related Code Files
**Create**
- `nginx/nginx.conf` — http block, upstreams, zones, gzip/brotli, security headers.
- `nginx/conf.d/app.conf` — server block(s), locations, rate limits, WS, microcache.
- (optional) `nginx/Dockerfile` if Brotli module needs compilation (else use `fholtwick/brotli` or openresty image with brotli).

**Modify**
- `docker-compose.yml` — add `nginx` service as entrypoint, publish 80/443, mount conf + cache volume, `depends_on` frontend+backend (append distinct service block; sequence after P1).

## Implementation Steps
1. Choose Nginx image with Brotli (e.g. `macbre/nginx-brotli` or build). Document choice.
2. `nginx.conf` http block:
   - `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;`
   - `zone=auth_limit ... rate=5r/m;` `zone=upload_limit ... rate=2r/s;` `zone=ws_limit ... rate=100r/s;`
   - `proxy_cache_path /var/cache/nginx keys_zone=micro:10m;`
   - gzip on (level 6) + brotli on (level 6) for text/css/js/json.
   - security headers (HSTS, CSP, X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy).
3. `app.conf` server block:
   - upstream `next` (frontend:3000), `nest` (backend:3001).
   - `location /api/auth/ { limit_req zone=auth_limit burst=5 nodelay; proxy_pass http://nest; }`
   - `location /api/upload/ { limit_req zone=upload_limit burst=2 nodelay; proxy_pass http://nest; }`
   - `location /api/ { limit_req zone=api_limit burst=20 nodelay; proxy_pass http://nest; }`
   - microcache block for `GET /api/feed`, `/api/posts/`: `proxy_cache micro; proxy_cache_valid 200 2s; add_header X-Cache-Status $upstream_cache_status;` cache key includes user cookie to avoid leaking personalized data.
   - `location /socket.io { proxy_pass http://nest; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 86400s; proxy_buffering off; limit_req zone=ws_limit burst=100 nodelay; }`
   - `location / { proxy_pass http://next; }` static with `expires 1d`.
   - `/admin/queues` (Bull Board) → nest, optionally extra basic auth.
4. Add Nginx service to `docker-compose.yml` (entrypoint, ports 80/443, mounts, cache volume).
5. (SSL deferred for local always-on server; document Let's Encrypt/certbot path for prod domain.)
6. Test: rate limit triggers 503 past burst; WS connects through Nginx; feed served with `X-Cache-Status: HIT` on rapid repeat; security headers present.

## Todo List
- [ ] Pick/Build brotli-capable Nginx image
- [ ] nginx.conf (zones, gzip/brotli, headers, cache path)
- [ ] app.conf (locations, rate limits, microcache)
- [ ] /socket.io WS proxy block
- [ ] Nginx service in docker-compose (entrypoint)
- [ ] Verify rate limit, WS, microcache, headers

## Success Criteria
- All traffic flows through Nginx; frontend + API + WS reachable.
- Exceeding burst returns 429/503; normal traffic unaffected.
- WebSocket (Phase 3) works end-to-end through Nginx.
- `X-Cache-Status: HIT` on repeated hot GET within 2s.
- Security headers present on responses.

## Risk Assessment
- **Depends on Phase 3** WS path → run after P3.
- **docker-compose.yml shared** → append Nginx block only; sequence after P1.
- **Microcache leaking personalized data** → include user cookie in cache key; only cache safe GETs.
- **Brotli module** → may require custom image; fallback gzip-only acceptable.

## Security Considerations
- HSTS only with valid TLS (enable when domain/cert ready).
- CSP tuned to avoid breaking Next.js inline/wasm; start report-only if risky.
- Bull Board path protected (token + optional basic auth).

## Next Steps
- Pairs with Phase 8 (Nginx access logs to Loki, optional nginx-exporter).
