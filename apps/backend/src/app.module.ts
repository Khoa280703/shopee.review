import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AuthModule } from './auth/auth.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { MetricsModule } from './metrics/metrics.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthController } from './health.controller';
import { FeedModule } from './feed/feed.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { MeilisearchModule } from './search/meilisearch.module';
import { SearchModule } from './search/search.module';
import { SocialModule } from './social/social.module';
import { StatsModule } from './stats/stats.module';
import { TrackerModule } from './tracker/tracker.module';
import { ScraperModule } from './scraper/scraper.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ envFilePath: ['.env', '../../.env'], isGlobal: true }),
    // Structured JSON logging for Loki/Promtail in prod; pretty-printed in dev.
    // /metrics + /health are silenced to keep scrape/probe noise out of logs.
    LoggerModule.forRoot({
      pinoHttp: {
        // `||` (not `??`): an empty LOG_LEVEL="" (as shipped in .env.example)
        // must fall through to the default, else pino throws "default level:
        // must be included in custom levels" and the app crashes on boot.
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        genReqId: (req) =>
          (req.headers['x-request-id'] as string) ?? randomUUID(),
        autoLogging: {
          ignore: (req) => {
            const url = req.url ?? '';
            return url.includes('/metrics') || url.includes('/health');
          },
        },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        // Redis-backed cache for multi-instance coherence when REDIS_URL is set
        // (production / Docker Compose). Falls back to in-memory LRU otherwise,
        // so host-based dev keeps working with zero infra.
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
          return {
            store: await redisStore({ url: redisUrl, ttl: 60_000 }),
            ttl: 60_000,
          };
        }
        return { ttl: 60_000, max: 500 };
      },
    }),
    PrismaModule,
    RedisModule,
    MeilisearchModule,
    QueueModule.forRoot(),
    AuthModule,
    UsersModule,
    PostsModule,
    SocialModule,
    NotificationsModule,
    FeedModule,
    StatsModule,
    TrackerModule,
    SearchModule,
    CategoriesModule,
    ScraperModule,
    UploadsModule,
    MetricsModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
  providers: [
    // Catch-all reporter for non-Prisma exceptions. The specific
    // PrismaExceptionFilter (registered in main.ts) shapes known DB errors.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
