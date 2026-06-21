# Phase 1 — Setup Monorepo + Docker + Prisma + DB Schema

## Context Links
- [Research: NestJS + Next.js Setup](../reports/researcher-02-nestjs-nextjs-setup.md)
- [Brainstorm: DB Schema](../reports/brainstorm-260610-1303-shopee-review-deal-aggregator.md)

## Overview
- **Priority**: P1 (blocking tất cả phase sau)
- **Status**: completed
- **Effort**: 3h
- **Mô tả**: Setup Turborepo monorepo với NestJS backend, Next.js 15 frontend, shared Prisma database package. Docker Compose cho local dev.

## Key Insights
- Turborepo + pnpm workspaces là sweet spot cho scale này (không cần Nx)
- Prisma schema đặt trong `packages/database/`, shared cho cả backend + frontend types
- Docker Compose dev có `db`; production dùng Coolify services riêng: `postgres` + `api` + `web`
- pnpm cho monorepo (faster, stricter deps)
- Store tiền bằng `Int` đơn vị VNĐ, không dùng `Float`
- Upload ảnh thủ công lưu local volume, expose qua backend `/uploads/*`

## Requirements
### Functional
- Monorepo build/dev chạy được cả 2 apps đồng thời
- DB migration chạy được từ root
- Prisma Client gen types dùng chung

### Non-functional
- Dev hot-reload < 2s
- Build time < 60s (cold), < 10s (cached)

## Architecture
```
shopee.review/
├── apps/
│   ├── backend/          # NestJS 10
│   │   ├── src/
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── package.json
│   └── frontend/         # Next.js 15
│       ├── src/
│       │   └── app/
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       ├── Dockerfile
│       └── package.json
├── packages/
│   └── database/          # Prisma + shared types
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── src/
│       │   └── index.ts   # Re-export PrismaClient + types
│       ├── tsconfig.json
│       └── package.json
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env
├── .env.example
├── .gitignore
├── .eslintrc.js
├── .prettierrc
└── tsconfig.base.json
```

## Related Code Files
### Create
- `package.json` — Root package.json with pnpm workspaces
- `pnpm-workspace.yaml` — Workspace config
- `turbo.json` — Turborepo pipeline config
- `tsconfig.base.json` — Shared TS config
- `.env.example` — Environment variables template
- `.env` — Local env (gitignored)
- `.gitignore`
- `.eslintrc.js`
- `.prettierrc`
- `docker-compose.yml` — Dev docker config
- `apps/backend/package.json`
- `apps/backend/tsconfig.json`
- `apps/backend/nest-cli.json`
- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `apps/frontend/next.config.ts`
- `apps/frontend/tailwind.config.ts`
- `apps/frontend/src/app/layout.tsx`
- `apps/frontend/src/app/page.tsx`
- `packages/database/package.json`
- `packages/database/tsconfig.json`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/index.ts`

## Implementation Steps

### Step 1: Init root monorepo
```bash
cd /home/khoa2807/working-sources/shopee.review
pnpm init
```

Root `package.json`:
```json
{
  "name": "shopee-review",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "db:migrate": "pnpm --filter @app/database migrate:dev",
    "db:generate": "pnpm --filter @app/database generate",
    "db:push": "pnpm --filter @app/database db:push"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### Step 2: pnpm-workspace.yaml
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Step 3: turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "generate": {
      "cache": false
    }
  }
}
```

### Step 4: tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### Step 5: Setup packages/database
```bash
mkdir -p packages/database/prisma packages/database/src
cd packages/database
pnpm init
pnpm add prisma @prisma/client
```

`packages/database/package.json`:
```json
{
  "name": "@app/database",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "tsx": "^4.0.0"
  }
}
```

### Step 6: Prisma Schema (CRITICAL — full schema)

`packages/database/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum DealStatus {
  DRAFT
  ACTIVE
  EXPIRED
  ARCHIVED
}

model Category {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  slug      String   @unique
  icon      String?
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  deals     Deal[]

  @@map("categories")
}

model Deal {
  id              Int        @id @default(autoincrement())
  title           String
  description     String?
  note            String?    // Lý do nên mua
  originalUrl     String     @map("original_url")
  affiliateUrl    String     @map("affiliate_url")
	  originalPrice   Int        @map("original_price") // VND
	  salePrice       Int        @map("sale_price")     // VND
  discountPercent Int        @map("discount_percent")
  images          Json       @default("[]") // String[] stored as JSONB
  shopName        String?    @map("shop_name")
  shopRating      Float?     @map("shop_rating")
  soldCount       Int?       @map("sold_count")
  categoryId      Int?       @map("category_id")
  category        Category?  @relation(fields: [categoryId], references: [id])
  tags            Json       @default("[]") // String[] stored as JSONB
  voucherCode     String?    @map("voucher_code")
  expiresAt       DateTime?  @map("expires_at")
  status          DealStatus @default(DRAFT)
  clickCount      Int        @default(0) @map("click_count")
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")
  clickLogs       ClickLog[]

  @@index([status])
  @@index([categoryId])
  @@index([createdAt])
  @@index([expiresAt])
  @@map("deals")
}

model ClickLog {
  id        Int      @id @default(autoincrement())
  dealId    Int      @map("deal_id")
  deal      Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  ip        String?
  userAgent String?  @map("user_agent")
  referer   String?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([dealId])
  @@index([createdAt])
  @@map("click_logs")
}
```

### Step 7: Database client export

`packages/database/src/index.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### Step 8: Setup NestJS backend

```bash
mkdir -p apps/backend/src
cd apps/backend
pnpm init
```

`apps/backend/package.json` — key dependencies:
```json
{
  "name": "@app/backend",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
  },
  "dependencies": {
    "@app/database": "workspace:*",
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/jwt": "^10.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/schedule": "^4.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/mapped-types": "^2.1.0",
    "@nestjs/serve-static": "^4.0.0",
    "@nestjs/throttler": "^6.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "multer": "^2.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.0",
    "playwright": "^1.50.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@types/express": "^5.0.0",
    "@types/multer": "^1.4.0",
    "@types/node": "^22.0.0",
    "@types/passport-jwt": "^4.0.0",
    "typescript": "^5.8.0"
  }
}
```

`apps/backend/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

`apps/backend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "target": "ES2022",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"]
}
```

`apps/backend/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT || 3001);
}
bootstrap();
```

`apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    // DealsModule, ScraperModule, AuthModule, SchedulerModule — added in Phase 3
  ],
})
export class AppModule {}
```

### Step 9: Setup Next.js frontend

```bash
cd apps/frontend
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Sau khi init, thêm dependency `@app/database` vào `apps/frontend/package.json`:
```json
{
  "dependencies": {
    "@app/database": "workspace:*"
  }
}
```

`apps/frontend/next.config.ts`:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cf.shopee.vn',
      },
      {
        protocol: 'https',
        hostname: 'down-vn.img.susercontent.com',
      },
    ],
  },
  transpilePackages: ['@app/database'],
};

export default nextConfig;
```

### Step 10: Docker Compose (dev)

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: shopee_review
      POSTGRES_PASSWORD: shopee_review_dev
      POSTGRES_DB: shopee_review
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shopee_review"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Production Postgres không chạy chung compose với app trong plan này. Phase 5 tạo **Coolify PostgreSQL service riêng** để app service dùng `DATABASE_URL` nội bộ, backup/volume độc lập.

### Step 11: Environment files

`.env.example`:
```env
# Database
DATABASE_URL=postgresql://shopee_review:shopee_review_dev@localhost:65432/shopee_review

# Backend
PORT=3001
JWT_SECRET=change-me-to-random-string-min-32-chars
ADMIN_PASSWORD=change-me-strong-password

# Shopee Affiliate
SHOPEE_AFFILIATE_ID=your-affiliate-id-here

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001/api
FRONTEND_URL=http://localhost:3000

# Uploads
UPLOAD_DIR=uploads
```

`.gitignore`:
```
node_modules/
dist/
.next/
.env
*.env.local
uploads/
.turbo/
coverage/
```

### Step 12: Init git + install + verify
```bash
cd /home/khoa2807/working-sources/shopee.review
git init
cp .env.example .env  # fill values
pnpm install
docker compose up -d  # start PostgreSQL
pnpm db:generate      # generate Prisma Client
pnpm db:migrate       # run initial migration
pnpm dev              # verify both apps start
```

## Todo List
- [x] Init root package.json, pnpm-workspace.yaml, turbo.json
- [x] Create tsconfig.base.json; lint uses package typecheck scripts
- [x] Setup packages/database with Prisma schema
- [x] Create initial migration
- [x] Setup apps/backend (NestJS) with PrismaModule
- [x] Wire ServeStaticModule for local uploads at `/uploads/*`
- [x] Wire ThrottlerModule global defaults
- [x] Setup apps/frontend (Next.js 15) with Tailwind + shadcn/ui
- [x] Create docker-compose.yml cho PostgreSQL dev
- [x] Create .env.example, .gitignore
- [x] Verify: pnpm install + pnpm dev chạy cả 2 apps
- [x] Verify: Prisma migration chạy thành công

## Success Criteria
- `pnpm dev` chạy NestJS trên :3001, Next.js trên :3000
- Prisma schema migrate thành công, `prisma studio` show tables
- Import `@app/database` types trong cả backend và frontend không lỗi
- Docker Compose PostgreSQL chạy stable
- Backend serve local files from `uploads/` via `/uploads/*`

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| pnpm workspace resolve lỗi | High | Dùng `workspace:*` protocol, verify từng package |
| Prisma generate conflict giữa apps | Medium | Single generate output, re-export from package |
| TypeScript path alias mismatch | Medium | tsconfig.base.json + per-app extends |

## Security Considerations
- `.env` phải gitignore, không commit secrets
- `ADMIN_PASSWORD` dùng strong random string
- `JWT_SECRET` >= 32 chars random
- PostgreSQL password cho dev OK weak, production phải strong
- `uploads/` must be gitignored and persisted as production volume

## Next Steps
- Phase 2: Implement Shopee scraper (depends on backend running)
- Phase 3: Implement deals CRUD + auth
