# Phase 3 — NestJS Backend: Deals CRUD, Auth, Scheduler, API

## Context Links
- [Research: NestJS Setup](../reports/researcher-02-nestjs-nextjs-setup.md)
- [Phase 1: DB Schema](phase-01-setup-monorepo.md)
- [Phase 2: Scraper](phase-02-implement-scraper.md)

## Overview
- **Priority**: P1
- **Status**: completed
- **Effort**: 6h
- **Mô tả**: Implement toàn bộ NestJS backend — Prisma service, deals CRUD, JWT auth (single admin), local image uploads, deal expiry scheduler, API endpoints cho frontend.

## Key Insights
- Feature-first module structure (không layer-first)
- Single admin auth = hardcoded username "admin" + env password + JWT
- Scheduler chạy cron để expire deals + update click counts
- Public API (no auth) cho frontend deal listing, Admin API (JWT) cho CRUD
- Pagination cursor-based hoặc offset-based (MVP dùng offset cho đơn giản)
- Admin upload ảnh thủ công lưu local volume, backend expose qua `/uploads/deals/*`
- Scrape endpoint rate-limited và trả partial result nếu Shopee fail

## Requirements
### Functional
- **PrismaModule**: Global module, inject PrismaService anywhere
- **AuthModule**: POST /api/auth/login → JWT token
- **DealsModule**:
  - Public: GET /api/deals (list, filter, sort, paginate), GET /api/deals/:id
  - Public: POST /api/deals/:id/click — log click + increment counter + redirect
  - Admin: POST /api/admin/deals/scrape — paste URL → return scraped data
  - Admin: POST /api/admin/deals — create deal
  - Admin: PATCH /api/admin/deals/:id — update deal
  - Admin: DELETE /api/admin/deals/:id — soft delete (archive)
  - Admin: GET /api/admin/deals — list all (including draft/archived)
- **UploadsModule**: POST /api/admin/uploads/deal-image — upload one local deal image
- **CategoriesModule**: CRUD categories (admin), list (public)
- **SchedulerModule**: Cron expire deals, cron update stats

### Non-functional
- API response < 200ms (database queries)
- JWT token expiry: 24h (single admin, convenience > security for MVP)

## Architecture
```
NestJS Backend Module Structure
================================
app.module.ts
  ├── ConfigModule (global)
  ├── ScheduleModule
  ├── PrismaModule (global)
  ├── AuthModule
  ├── DealsModule
  ├── CategoriesModule
  ├── ScraperModule (from Phase 2)
  ├── UploadsModule
  └── SchedulerModule

API Routes:
  PUBLIC
    GET    /api/deals              — list deals (filter, sort, paginate)
    GET    /api/deals/:id          — deal detail
    POST   /api/deals/:id/click   — log click → redirect affiliate URL
    GET    /api/categories         — list categories

  ADMIN (JWT required)
    POST   /api/auth/login         — login → JWT
    POST   /api/admin/deals/scrape — scrape Shopee URL → return data
    POST   /api/admin/deals        — create deal
    PATCH  /api/admin/deals/:id    — update deal
    DELETE /api/admin/deals/:id    — archive deal
    GET    /api/admin/deals        — list all deals (inc. draft/archived)
    POST   /api/admin/categories   — create category
    PATCH  /api/admin/categories/:id — update category
    DELETE /api/admin/categories/:id — delete category
    GET    /api/admin/deals/stats  — dashboard stats
    POST   /api/admin/uploads/deal-image — upload local image
```

## Related Code Files
### Create
- `apps/backend/src/prisma/prisma.module.ts`
- `apps/backend/src/prisma/prisma.service.ts`
- `apps/backend/src/auth/auth.module.ts`
- `apps/backend/src/auth/auth.controller.ts`
- `apps/backend/src/auth/auth.service.ts`
- `apps/backend/src/auth/jwt.strategy.ts`
- `apps/backend/src/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/auth/dto/login.dto.ts`
- `apps/backend/src/deals/deals.module.ts`
- `apps/backend/src/deals/deals.controller.ts`
- `apps/backend/src/deals/deals.service.ts`
- `apps/backend/src/deals/deals-admin.controller.ts`
- `apps/backend/src/deals/dto/create-deal.dto.ts`
- `apps/backend/src/deals/dto/update-deal.dto.ts`
- `apps/backend/src/deals/dto/query-deals.dto.ts`
- `apps/backend/src/categories/categories.module.ts`
- `apps/backend/src/categories/categories.controller.ts`
- `apps/backend/src/categories/categories.service.ts`
- `apps/backend/src/categories/dto/create-category.dto.ts`
- `apps/backend/src/uploads/uploads.module.ts`
- `apps/backend/src/uploads/uploads.controller.ts`
- `apps/backend/src/uploads/local-upload.service.ts`
- `apps/backend/src/scheduler/scheduler.module.ts`
- `apps/backend/src/scheduler/scheduler.service.ts`

### Modify
- `apps/backend/src/app.module.ts` — import all modules

## Implementation Steps

### Step 1: PrismaModule (global)

`apps/backend/src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@app/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/backend/src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Step 2: AuthModule (JWT single admin)

`apps/backend/src/auth/dto/login.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

`apps/backend/src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(username: string, password: string) {
    const adminPassword = this.configService.getOrThrow<string>('ADMIN_PASSWORD');

    if (username !== 'admin' || password !== adminPassword) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }

    const payload = { sub: 'admin', username: 'admin' };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
```

`apps/backend/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; username: string }) {
    return { userId: payload.sub, username: payload.username };
  }
}
```

`apps/backend/src/auth/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`apps/backend/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }
}
```

`apps/backend/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

### Step 3: Deals DTOs

`apps/backend/src/deals/dto/create-deal.dto.ts`:
```typescript
import { IsString, IsNumber, IsOptional, IsArray, IsEnum, IsDateString, IsUrl, Min } from 'class-validator';
import { DealStatus } from '@app/database';

export class CreateDealDto {
  @IsString()
  title: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  note?: string;

  @IsUrl()
  originalUrl: string;

  @IsString()
  affiliateUrl: string;

  @IsNumber() @Min(0)
  originalPrice: number;

  @IsNumber() @Min(0)
  salePrice: number;

  @IsNumber() @Min(0)
  discountPercent: number;

  @IsOptional() @IsArray()
  images?: string[];

  @IsOptional() @IsString()
  shopName?: string;

  @IsOptional() @IsNumber()
  shopRating?: number;

  @IsOptional() @IsNumber()
  soldCount?: number;

  @IsOptional() @IsNumber()
  categoryId?: number;

  @IsOptional() @IsArray()
  tags?: string[];

  @IsOptional() @IsString()
  voucherCode?: string;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsOptional() @IsEnum(DealStatus)
  status?: DealStatus;
}
```

`apps/backend/src/deals/dto/update-deal.dto.ts`:
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateDealDto } from './create-deal.dto';

export class UpdateDealDto extends PartialType(CreateDealDto) {}
```

`apps/backend/src/deals/dto/query-deals.dto.ts`:
```typescript
import { IsOptional, IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { DealStatus } from '@app/database';

export class QueryDealsDto {
  @IsOptional() @Transform(({ value }) => parseInt(value)) @IsNumber() @Min(1)
  page?: number = 1;

  @IsOptional() @Transform(({ value }) => parseInt(value)) @IsNumber() @Min(1)
  limit?: number = 20;

  @IsOptional() @IsNumber() @Transform(({ value }) => parseInt(value))
  categoryId?: number;

  @IsOptional() @IsString()
  tag?: string;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsEnum(DealStatus)
  status?: DealStatus;

  @IsOptional() @IsString()
  sortBy?: 'createdAt' | 'discountPercent' | 'salePrice' | 'clickCount' = 'createdAt';

  @IsOptional() @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

### Step 4: Deals Service

`apps/backend/src/deals/deals.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DealStatus, Prisma } from '@app/database';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryDealsDto) {
    const { page = 1, limit = 20, categoryId, tag, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.DealWhereInput = {
      ...(status ? { status } : { status: DealStatus.ACTIVE }),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };

    const [deals, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: { category: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deal.count({ where }),
    ]);

    return {
      data: deals,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllAdmin(query: QueryDealsDto) {
    const { page = 1, limit = 20, categoryId, tag, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.DealWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };

    const [deals, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: { category: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deal.count({ where }),
    ]);

    return {
      data: deals,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!deal) throw new NotFoundException('Deal không tồn tại');
    return deal;
  }

  async create(dto: CreateDealDto) {
    return this.prisma.deal.create({
      data: {
        ...dto,
        images: dto.images || [],
        tags: dto.tags || [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        status: dto.status || DealStatus.DRAFT,
      },
    });
  }

  async update(id: number, dto: UpdateDealDto) {
    await this.findOne(id); // verify exists
    return this.prisma.deal.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
      },
    });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.ARCHIVED },
    });
  }

  async logClick(id: number, ip?: string, userAgent?: string, referer?: string) {
    const deal = await this.findOne(id);

    await Promise.all([
      this.prisma.clickLog.create({
        data: { dealId: id, ip, userAgent, referer },
      }),
      this.prisma.deal.update({
        where: { id },
        data: { clickCount: { increment: 1 } },
      }),
    ]);

    return { affiliateUrl: deal.affiliateUrl };
  }

  async expireDeals() {
    const now = new Date();
    return this.prisma.deal.updateMany({
      where: {
        status: DealStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: { status: DealStatus.EXPIRED },
    });
  }

  async getStats() {
    const [totalDeals, activeDeals, totalClicks, todayClicks] = await Promise.all([
      this.prisma.deal.count(),
      this.prisma.deal.count({ where: { status: DealStatus.ACTIVE } }),
      this.prisma.clickLog.count(),
      this.prisma.clickLog.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);
    return { totalDeals, activeDeals, totalClicks, todayClicks };
  }
}
```

### Step 5: Deals Controllers

`apps/backend/src/deals/deals.controller.ts` (public):
```typescript
import { Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { DealsService } from './deals.service';
import { QueryDealsDto } from './dto/query-deals.dto';

@Controller('deals')
export class DealsController {
  constructor(private dealsService: DealsService) {}

  @Get()
  findAll(@Query() query: QueryDealsDto) {
    return this.dealsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.dealsService.findOnePublic(id);
  }

  @Post(':id/click')
  async logClick(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    const userAgent = req.headers['user-agent'];
    const referer = req.headers['referer'];
    return this.dealsService.logClick(id, ip, userAgent, referer);
  }
}
```

`apps/backend/src/deals/deals-admin.controller.ts` (admin, JWT protected):
```typescript
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DealsService } from './deals.service';
import { ScraperService } from '../scraper/scraper.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';

@Controller('admin/deals')
@UseGuards(JwtAuthGuard)
export class DealsAdminController {
  constructor(
    private dealsService: DealsService,
    private scraperService: ScraperService,
  ) {}

  @Post('scrape')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async scrape(() dto: ScrapeDealDto) {
    return this.scraperService.scrapeShopeeUrl(dto.url);
  }

  @Get()
  findAll(@Query() query: QueryDealsDto) {
    return this.dealsService.findAllAdmin(query);
  }

  @Post()
  create(@Body() dto: CreateDealDto) {
    return this.dealsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDealDto) {
    return this.dealsService.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.dealsService.archive(id);
  }

  @Get('stats')
  getStats() {
    return this.dealsService.getStats();
  }
}
```

### Step 6: Deals Module

`apps/backend/src/deals/deals.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsAdminController } from './deals-admin.controller';
import { DealsService } from './deals.service';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ScraperModule],
  controllers: [DealsController, DealsAdminController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
```

### Step 7: Categories Module

`apps/backend/src/categories/dto/create-category.dto.ts`:
```typescript
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional() @IsString()
  icon?: string;

  @IsOptional() @IsNumber()
  sortOrder?: number;
}
```

`apps/backend/src/categories/categories.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async create(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  async update(id: number, dto: Partial<CreateCategoryDto>) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async delete(id: number) {
    await this.prisma.deal.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    return this.prisma.category.delete({ where: { id } });
  }
}
```

`apps/backend/src/categories/categories.controller.ts`:
```typescript
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateCategoryDto>) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id);
  }
}
```

`apps/backend/src/categories/categories.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
```

### Step 8: Uploads Module (local image storage)

`apps/backend/src/uploads/local-upload.service.ts`:
```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class LocalUploadService {
  constructor(private config: ConfigService) {}

  async saveDealImage(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Missing file');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Unsupported image type');
    }

    const uploadRoot = this.config.get<string>('UPLOAD_DIR') || 'uploads';
    const dir = join(process.cwd(), uploadRoot, 'deals');
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await writeFile(join(dir, filename), file.buffer);
    return { url: `/uploads/deals/${filename}` };
  }
}
```

`apps/backend/src/uploads/uploads.controller.ts`:
```typescript
import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LocalUploadService } from './local-upload.service';

@Controller('admin/uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private uploads: LocalUploadService) {}

  @Post('deal-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadDealImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.saveDealImage(file);
  }
}
```

`apps/backend/src/uploads/uploads.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { LocalUploadService } from './local-upload.service';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [LocalUploadService],
})
export class UploadsModule {}
```

### Step 9: Scheduler Module

`apps/backend/src/scheduler/scheduler.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DealsService } from '../deals/deals.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private dealsService: DealsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredDeals() {
    const result = await this.dealsService.expireDeals();
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} deals`);
    }
  }
}
```

`apps/backend/src/scheduler/scheduler.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { DealsModule } from '../deals/deals.module';

@Module({
  imports: [DealsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
```

### Step 10: Wire AppModule

Update `apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DealsModule } from './deals/deals.module';
import { CategoriesModule } from './categories/categories.module';
import { ScraperModule } from './scraper/scraper.module';
import { UploadsModule } from './uploads/uploads.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    DealsModule,
    CategoriesModule,
    ScraperModule,
    UploadsModule,
    SchedulerModule,
  ],
})
export class AppModule {}
```

### Step 11: Test APIs
```bash
# Start backend
pnpm --filter @app/backend dev

# Test auth
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Test scrape (with JWT token from above)
curl -X POST http://localhost:3001/api/admin/deals/scrape \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://shopee.vn/product-i.123.456"}'

# Test local upload
curl -X POST http://localhost:3001/api/admin/uploads/deal-image \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/image.webp"

# Test public deals
curl http://localhost:3001/api/deals
curl http://localhost:3001/api/categories
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/admin/deals
```

## Todo List
- [x] Create PrismaModule + PrismaService (global)
- [x] Create AuthModule: login endpoint, JWT strategy, guard
- [x] Create Deals DTOs: create, update, query
- [x] Create DealsService: CRUD, click tracking, expiry, stats
- [x] Create DealsController (public): list, detail, click
- [x] Create DealsAdminController (protected): scrape, CRUD, stats
- [x] Create CategoriesModule: CRUD + controller
- [x] Create UploadsModule: local image upload, MIME/size validation
- [x] Create SchedulerModule: expiry cron
- [x] Wire all modules into AppModule
- [x] Test all API endpoints with curl/Postman
- [x] Verify JWT auth flow end-to-end

## Success Criteria
- `POST /api/auth/login` trả JWT token
- `POST /api/admin/deals/scrape` trả ScrapedDealData từ Shopee URL
- `POST /api/admin/deals` tạo deal, `GET /api/deals` list deals
- `GET /api/admin/deals` trả draft/active/expired/archived nếu không truyền status filter
- `POST /api/admin/uploads/deal-image` lưu ảnh local và trả `/uploads/deals/*`
- `POST /api/deals/:id/click` log click + trả affiliate URL
- Cron job expire deals chạy mỗi 5 phút
- Unauthorized request bị reject 401

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Prisma query N+1 | Medium | Dùng include cho relations, review query logs |
| JWT secret leak | High | .env gitignored, strong random secret |
| Scraper timeout block API thread | Medium | Async, set timeout, error handling |
| CORS issues frontend-backend | Low | ConfigModule CORS whitelist |
| Upload disk fills up | Medium | 5MB limit, persist volume, add cleanup later |

## Security Considerations
- Admin password hash comparison (MVP: plaintext compare, acceptable cho single-admin)
- JWT secret >= 32 chars, rotate nếu leak
- Rate limit login + scrape endpoints with `@Throttle`
- Sanitize user input (class-validator whitelist: true)
- Click log IP hashing (GDPR compliance — MVP skip, note for later)
- Validate upload MIME/size; persist `uploads/` outside container

## Next Steps
- Phase 4: Frontend consume API endpoints — deal listing, admin panel
