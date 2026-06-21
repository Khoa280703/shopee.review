# NestJS + Next.js 15 + PostgreSQL + Prisma Setup Research
**Date:** 2026-06-10 | **Scope:** Architecture, tooling, and integration patterns for deal aggregator app

---

## 1. Project Structure: Monorepo Strategy

**Recommendation:** Turborepo monorepo (not separate repos, not Nx for this scale).

**Structure:**
```
monorepo/
├── apps/
│   ├── backend/ (NestJS)
│   └── frontend/ (Next.js 15)
├── packages/
│   ├── database/ (Prisma, migrations, shared types)
│   ├── shared/ (DTOs, types, constants)
│   └── validation/ (Zod schemas)
├── docker-compose.yml
└── turbo.json
```

**Why:** Turborepo handles build caching, task orchestration, and parallel builds cleanly. NestJS + Next.js stack doesn't need Nx complexity. Yarn Workspaces for dependency linking.

---

## 2. Prisma Setup: Single Schema, Shared Across Apps

**Pattern:** One `packages/database/` exports Prisma Client + generated types.

**Config (prisma.schema):**
- Single source of truth in `packages/database/prisma/schema.prisma`
- Generate client to `packages/database/prisma/generated` (custom output dir)
- Both backend and frontend import `@app/database` → get Client + types
- Migrations live in `packages/database/prisma/migrations/`

**Backend integration (NestJS):**
- Create `PrismaService` extending `PrismaClient`
- Inject globally via `PrismaModule`
- Lifecycle hooks: `onModuleInit()` → `$connect()`, `onModuleDestroy()` → `$disconnect()`
- Use singleton scope (default)

**Frontend access (Next.js):**
- Import types from `@app/database` for SSR/API routes
- Never instantiate Client in browser code (use backend API instead)

---

## 3. Docker Compose Setup

**Three-service stack:**
```yaml
services:
  db:
    image: postgres:16-alpine
    healthcheck: pg_isready -U $DB_USER
  api:
    build: ./apps/backend
    depends_on:
      db:
        condition: service_healthy
    env:
      DATABASE_URL: postgresql://user:pass@db:5432/db
      CHOKIDAR_USEPOLLING: "true"  # Hot reload on Mac/Windows
    volumes:
      - ./apps/backend:/app
      - /app/node_modules  # Prevent bind mount override
  web:
    build: ./apps/frontend
    depends_on:
      - api
    env:
      NEXT_PUBLIC_API_URL: http://api:3001
      WATCHPACK_POLLING: "true"  # Hot reload
    volumes:
      - ./apps/frontend:/app
      - /app/node_modules
```

**Key:** Use service names as hostnames (`db:5432`), not `localhost`. Add health checks. Anonymous volumes preserve node_modules.

---

## 4. NestJS Module Structure (Deal Aggregator)

**Feature-first, not layer-first. Modules by domain.**

```
src/
├── deals/
│   ├── deals.controller.ts
│   ├── deals.service.ts
│   ├── deals.module.ts
│   └── dto/
│       ├── create-deal.dto.ts
│       └── update-deal.dto.ts
├── scraper/
│   ├── scraper.service.ts
│   ├── scraper.module.ts
│   └── integrations/
│       └── shopee-scraper.ts
├── affiliate/
│   ├── affiliate.service.ts
│   └── affiliate.module.ts
├── scheduler/
│   ├── scheduler.service.ts
│   └── scheduler.module.ts
├── auth/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── jwt.strategy.ts
│   └── guards/
│       └── jwt.guard.ts
├── shared/
│   ├── filters/
│   ├── interceptors/
│   └── pipes/
└── app.module.ts
```

**Dependency pattern:**
- `DealsModule`: exports `DealsService`
- `ScraperModule`: imports `DealsModule`, injects `DealsService`
- `SchedulerModule`: imports both, orchestrates scraper runs
- Avoid circular imports (use `forwardRef()` only if unavoidable — fix structure instead)

---

## 5. NestJS Scheduler: Deal Expiry & Scraping

**Package:** `@nestjs/schedule` (official, battle-tested).

**Setup:**
```typescript
// scheduler.module.ts
@Module({
  providers: [SchedulerService],
  imports: [DealsModule, ScraperModule],
})
export class SchedulerModule {}

// scheduler.service.ts
@Injectable()
export class SchedulerService {
  @Cron('0 */6 * * *')  // Every 6 hours
  async runScraper() { }

  @Cron('0 2 * * *')  // Daily at 2 AM
  async expireDealsCron() { }

  @Interval(5 * 60 * 1000)  // Every 5 min
  async updateDealsStatus() { }
}
```

**For production:** Use `SchedulerRegistry` for dynamic scheduling if multi-instance needed.

---

## 6. Simple JWT Auth (Single Admin)

**Setup (minimal, under 100 lines of code):**

**auth.service.ts:**
```typescript
@Injectable()
export class AuthService {
  signIn(username: string, password: string) {
    if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
      const payload = { sub: 'admin', username: 'admin' };
      return { access_token: this.jwtService.sign(payload) };
    }
    throw new UnauthorizedException();
  }
}
```

**Protect routes:**
```typescript
@UseGuards(JwtAuthGuard)
@Get('/admin/stats')
getStats() { }
```

**Packages needed:**
- `@nestjs/jwt` — token generation
- `@nestjs/passport` + `passport-jwt` — route guards
- `.env`: `JWT_SECRET=<strong-random-string>`, `ADMIN_PASSWORD=<strong>`
- Token expiry: 1 hour (refresh strategy optional for single admin)

---

## 7. Next.js 15 App Router: Deal Listing with SEO

**Rendering strategy for deal pages:**
```typescript
// app/deals/page.tsx
export const revalidate = 300;  // ISR: revalidate every 5 min

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Latest Deals | Review',
    description: 'Curated deals from Shopee',
    openGraph: {
      type: 'website',
      images: [{ url: '/og-deals.png' }],
    },
    robots: 'index, follow',
  };
}

export default async function DealsPage() {
  const deals = await fetch('http://api:3001/deals', {
    next: { revalidate: 300 },
  }).then(r => r.json());

  return (
    <>
      <Script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            itemListElement: deals.map(d => ({
              '@type': 'Product',
              name: d.title,
              url: d.url,
              price: d.price,
            })),
          }),
        }}
      />
      <DealsList deals={deals} />
    </>
  );
}
```

**SSR for dynamic content** (personalized deals per user): Remove `revalidate` → forces dynamic rendering.

**shadcn/ui setup:**
```bash
npx shadcn-ui@latest init  # Handles Tailwind + components
npx shadcn-ui@latest add button card
```

Then:
```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
```

---

## 8. Validation: Zod + class-validator Split

**Pragmatic 2026 approach:**
- **class-validator** at HTTP boundary (NestJS pipes) → maps cleanly to error responses
- **Zod** for inter-service contracts, env config, frontend type safety

**Setup:**
```typescript
// shared validation
import { z } from 'zod';
export const CreateDealSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  price: z.number().positive(),
});
export type CreateDealInput = z.infer<typeof CreateDealSchema>;

// NestJS DTOs (class-validator)
export class CreateDealDto implements CreateDealInput {
  @IsString() title: string;
  @IsUrl() url: string;
  @IsPositive() price: number;
}
```

**Package:** `zod-prisma-types` or `prisma-zod-generator` auto-generate Zod schemas from Prisma.

---

## 9. Key Packages Checklist

| Layer | Package | Purpose |
|-------|---------|---------|
| **Database** | `@prisma/client`, `prisma` | ORM, migrations |
| **Backend** | `@nestjs/common`, `@nestjs/core` | Framework |
| | `@nestjs/jwt`, `passport-jwt` | Auth |
| | `@nestjs/schedule`, `@types/cron` | Cron jobs |
| | `zod`, `zod-prisma-types` | Validation |
| **Scraping** | `cheerio`, `axios` | Static pages (fast) |
| | `puppeteer` | Dynamic content (JS rendering) |
| **Frontend** | `next@15`, `react@19` | Framework |
| | `shadcn-ui` | UI components |
| | `zod` | Runtime validation |
| **Dev** | `typescript`, `eslint`, `prettier` | Tooling |
| | `docker`, `docker-compose` | Containers |

**Scraping strategy:** Start with Cheerio + Axios (50-100x faster for static HTML). Use Puppeteer only if site requires JavaScript rendering.

---

## 10. Development Workflow

**Local dev:**
```bash
docker-compose up -d
yarn install
yarn dev  # Runs NestJS API + Next.js frontend concurrently
```

**Database changes:**
```bash
cd packages/database
npx prisma migrate dev --name add_new_field
```

**Build & test before deploy:**
```bash
yarn build  # Turborepo builds both apps
yarn test   # Runs all test suites
```

---

## Unresolved Questions

1. How to handle deal images (store URLs, proxy, or upload to S3)?
2. Rate limiting strategy for Shopee scraper (detect/handle blocks)?
3. Affiliate link redirect tracking — use shortener or custom service?
4. Multi-language support needed (deal titles/descriptions)?
5. Analytics backend for deal clicks/conversions?

---

## Sources
- [NestJS Prisma Integration Official Docs](https://docs.nestjs.com/recipes/prisma)
- [Prisma NestJS Guide](https://www.prisma.io/docs/guides/nestjs)
- [NestJS + Next.js Turborepo Boilerplate](https://github.com/vndevteam/nestjs-turbo)
- [Docker Compose for Next.js + NestJS Dev](https://dev.to/mahmoudmkdm/docker-compose-for-nextjs-nestjs-local-dev-4me5)
- [NestJS Module Structure Best Practices 2026](https://encore.dev/articles/nestjs-project-structure-best-practices)
- [Sharing Prisma in Monorepo](https://medium.com/@ajeeshRS/setting-up-a-shared-postgresql-database-in-a-turborepo-for-express-js-and-next-js-using-prisma-a447d089237f)
- [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
- [Cheerio vs Puppeteer Comparison 2026](https://proxyway.com/guides/cheerio-vs-puppeteer-for-web-scraping)
- [NestJS JWT Authentication Guide](https://encore.dev/articles/nestjs-authentication-guide)
- [Next.js 15 App Router SEO](https://dev.to/simplr_sh/nextjs-15-app-router-seo-comprehensive-checklist-3d3f)
- [Zod vs Class-Validator in NestJS](https://dev.to/young_gao/input-validation-in-typescript-apis-zod-vs-joi-vs-class-validator-2gcg)
