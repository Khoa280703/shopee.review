# shopee.review

Mạng xã hội review sản phẩm Shopee: bất kỳ ai cũng có thể đăng bài review kèm affiliate link để kiếm thu nhập. Người dùng paste link Shopee, hệ thống tự scrape thông tin sản phẩm (API-first, fallback Playwright, cache 24h), người dùng viết review + nhập affiliate link riêng rồi publish.

## Stack

- pnpm workspace + Turborepo
- NestJS API: `apps/backend`
- Next.js 15 (App Router) frontend: `apps/frontend`
- Prisma 6 + PostgreSQL 16: `packages/database`
- Auth: JWT trong HttpOnly Cookie + Google OAuth (Passport)
- Email verify: Resend
- Image upload: Cloudflare R2 (S3-compatible)
- Realtime: Server-Sent Events (notifications)
- Search: PostgreSQL Full-Text Search

## Tính năng chính

- Đăng ký/đăng nhập email (có xác minh email) + Google OAuth
- Trang cá nhân path-based `/{username}` + reserved username blocklist
- Đăng bài review: auto-scrape Shopee + upload ảnh R2 + affiliate link bắt buộc
- Social: follow/unfollow, like, comment (reply 1 cấp) với counter denormalized
- Bảng tin cá nhân (posts từ người đang theo dõi) + thông báo realtime (SSE)
- Click tracking `/r/:postId` (dedup 1h/IP) + dashboard thống kê
- Tìm kiếm bài viết (FTS) + người dùng, trending, SEO (sitemap, robots, JSON-LD)

## Local Setup

```bash
pnpm install
docker compose up -d db
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
```

Run apps:

```bash
pnpm --filter @app/backend dev
pnpm --filter @app/frontend dev
```

Default URLs:

- Frontend: `http://localhost:5166`
- Backend: `http://localhost:3066/api`

## Environment

Root `.env` (xem `.env.example`):

- `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`
- `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, `FRONTEND_URL`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Email: `RESEND_API_KEY`, `MAIL_FROM`
- Cloudflare R2: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `SHOPEE_AFFILIATE_ID` (optional)

> Google OAuth, Resend và R2 sẽ chạy ở chế độ placeholder cho tới khi bạn điền env tương ứng (app vẫn boot bình thường; verify link được log ra console khi chưa có Resend).

## Deploy

See [docs/deployment-guide.md](docs/deployment-guide.md).
