---
title: "shopee.review MVP Phase 1"
description: "Deal aggregator website - admin paste Shopee URL, auto-scrape, gen affiliate link, publish deals"
status: completed
priority: P1
effort: 24h
branch: main
tags: [mvp, shopee, affiliate, nestjs, nextjs, scraper]
created: 2026-06-10
---

# shopee.review — MVP Phase 1

## Tổng quan
Website deal aggregator cho Shopee Affiliate. Admin paste URL → auto-scrape → gen affiliate link → publish. User browse deals trên shopee.review.

## Tech Stack
NestJS + Next.js 15 + PostgreSQL + Prisma | Turborepo monorepo | Shopee API-first scraper + Playwright fallback | Docker Compose + Coolify/Traefik + Cloudflare

## Phase Overview

| Phase | Mô tả | Effort | Status | Dependencies |
|-------|--------|--------|--------|--------------|
| [Phase 1](phase-01-setup-monorepo.md) | Turborepo + Docker + Prisma + DB schema | 3h | completed | None |
| [Phase 2](phase-02-implement-scraper.md) | Shopee URL parser + API-first scraper + Playwright fallback + affiliate link gen | 5h | completed | Phase 1 |
| [Phase 3](phase-03-implement-backend.md) | NestJS deals CRUD, auth, local uploads, scheduler, API | 6h | completed | Phase 1, 2 |
| [Phase 4](phase-04-implement-frontend.md) | Next.js newsfeed/grid listing + /admin panel + SEO | 7h | completed | Phase 3 |
| [Phase 5](phase-05-deploy.md) | Coolify deploy + Traefik routing + PostgreSQL service + Cloudflare | 3h | completed | Phase 4 |

## Key Dependencies
- Node.js 20+ / pnpm
- Docker & Docker Compose
- PostgreSQL 16
- Playwright (Chromium) only as fallback if direct API fails
- Shopee Affiliate ID (from affiliate.shopee.vn)
- Coolify + Traefik available on home server

## Research Reports
- [Shopee Scraping](../reports/researcher-01-shopee-scraping.md)
- [NestJS + Next.js Setup](../reports/researcher-02-nestjs-nextjs-setup.md)
- [Brainstorm](../reports/brainstorm-260610-1303-shopee-review-deal-aggregator.md)

## Risks
- Shopee anti-bot có thể block API scraper → graceful partial result + Playwright fallback + rate limit
- API format thay đổi → abstract scraper layer, dễ update
- Playwright tốn RAM → chỉ fallback on-demand, không batch, không launch nếu API thành công
- Local upload volume mất dữ liệu nếu cấu hình sai → persist uploads volume trong Coolify

## Validation Log

### Session 2 — 2026-06-10
**Trigger:** `$cook --auto` implementation

#### Completed
- Built pnpm/Turborepo monorepo with NestJS API, Next.js frontend, Prisma database package.
- Implemented API-first Shopee scraper with Playwright fallback and manual partial result.
- Implemented `/admin/*` frontend admin pages and JWT-protected `/api/admin/*` backend routes.
- Implemented local image upload to backend `/uploads/*`, rendered from frontend via API asset origin.
- Implemented PostgreSQL as separate Docker Compose service on local port `65432`.
- Added Coolify deployment guide for separate Postgres/API/Web services.

#### Verification
- `docker compose up -d db` passed.
- `pnpm db:migrate --name initial_schema` created and applied Prisma migration.
- `pnpm build` passed for database, backend, frontend.
- `pnpm test` passed: backend Vitest 4/4, database/frontend typecheck.
- API smoke passed: health OK, admin login OK, public hides DRAFT, public shows ACTIVE, click tracking returns affiliate URL.
- Frontend smoke passed: `/` and `/admin/login` return HTTP 200.
- Docker build passed: `shopee-review-frontend:test` and `shopee-review-backend:test`.

#### Review Fixes Applied
- Fixed root `.env` loading for backend when run via `pnpm --filter`.
- Fixed `images`/`tags` schema from JSONB to Postgres `TEXT[]`.
- Fixed public deal detail/click to require `ACTIVE`.
- Fixed local upload asset URL handling in frontend.
- Fixed scraper body validation.
- Fixed Docker images by adding OpenSSL to builder base and ensuring `apps/frontend/public` exists.

### Session 1 — 2026-06-10
**Trigger:** Initial plan validation before implementation
**Questions asked:** 6

#### Questions & Answers

1. **[Architecture]** Scraper sẽ tốn ~400MB RAM cho Chromium. Với flow thủ công, approach nào?
   - Options: Playwright XHR intercept | Direct API call | Playwright trước, optimize sau
   - **Answer:** Direct API call trước, fallback Playwright
   - **Custom input:** "Cứ thử api trước, nếu không được thì mới dùng giả lập browser"
   - **Rationale:** Giảm RAM footprint, giữ đơn giản. Playwright chỉ khi API bị block.

2. **[Architecture]** Ảnh sản phẩm: Shopee có thể block hotlinking. Xử lý thế nào?
   - Options: Shopee CDN trực tiếp | Download local | Proxy on-demand
   - **Answer:** CDN trực tiếp, fallback download + manual upload
   - **Custom input:** "Cứ dùng trực tiếp trước, nếu không được thì down về local, và có option tự up ảnh, chỉnh layout"
   - **Rationale:** MVP dùng CDN, thêm option upload ảnh thủ công cho admin.

3. **[Scope]** Dual view (grid + feed) — làm cả 2 hay chỉ grid cho MVP?
   - Options: Grid only cho MVP | Cả grid + feed ngay
   - **Answer:** Cả 2, ưu tiên newsfeed view
   - **Custom input:** "Làm cả 2 luôn, ưu tiên view newsfeed"
   - **Rationale:** Phase 4 cần implement cả newsfeed + grid, newsfeed là default view.

4. **[Infrastructure]** Home server kết nối internet bằng cách nào?
   - Options: Cloudflare Tunnel | Port forward + Nginx | Setup riêng
   - **Answer:** Traefik + Coolify + Cloudflare (đã có sẵn)
   - **Custom input:** "Tôi đã có dùng Traefik, Coolify + Cloudflare"
   - **Rationale:** Phase 5 cần điều chỉnh — không cần Nginx/Tunnel, dùng Coolify deploy.

5. **[UX]** Khi scrape fail, admin xử lý thế nào?
   - Options: 2 bước Scrape rồi Edit | Auto-fill + manual fallback | Manual hoàn toàn
   - **Answer:** Auto-fill graceful — điền được gì thì điền, admin tự edit phần còn lại
   - **Custom input:** "Nếu fail thì không auto fill đầy đủ, cái gì được thì dùng rồi tôi sẽ tự edit thủ công"
   - **Rationale:** Scraper phải graceful degrade, không block flow nếu fail.

6. **[Tooling]** Package manager?
   - Options: pnpm | yarn | npm | bun
   - **Answer:** pnpm (confirmed)
   - **Rationale:** Không thay đổi, plan giữ nguyên.

#### Confirmed Decisions
- Scraper: Direct API → Playwright fallback — giảm complexity + RAM
- Images: Shopee CDN → download fallback → admin upload option
- Dual view: Cả grid + newsfeed trong Phase 4, newsfeed default
- Deploy: Coolify + Traefik (đã có), bỏ Nginx/Tunnel setup
- Admin UX: Graceful scrape degradation, manual edit luôn available
- Package manager: pnpm (confirmed)

#### Action Items
- [x] Phase 2: Đổi scraper approach — API call trước, Playwright fallback
- [x] Phase 4: Thêm newsfeed view component + toggle, newsfeed là default
- [x] Phase 4: Thêm admin image upload option lưu local
- [x] Phase 4: Scrape form graceful degrade khi fail
- [x] Phase 5: Điều chỉnh deploy cho Coolify + Traefik, bỏ Nginx/Tunnel/Nginx config

#### Impact on Phases
- Phase 2: Đổi scraper strategy — API client trước, Playwright là fallback provider. Vẫn cài Playwright nhưng không dùng mặc định.
- Phase 3: Thêm local uploads endpoint + static serving `/uploads/*`; Postgres production chạy service riêng trong Coolify.
- Phase 4: Thêm newsfeed view (default) + grid view + toggle. Thêm admin image upload local. Scrape form graceful degrade. Admin routes dùng `/admin/*`.
- Phase 5: Bỏ Nginx + Cloudflare Tunnel config, thay bằng Coolify services + Traefik labels/routes + persistent volumes.
