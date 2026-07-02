import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT, type AppRedisClient } from '../redis/redis.module';

// Lock TTL < cron interval (5 min) so the lock self-expires before the next
// tick, guaranteeing exactly one refresh per cycle even across many instances.
const LOCK_KEY = 'lock:trending-refresh';
const LOCK_TTL_MS = 4 * 60 * 1000;

/**
 * Refreshes the trending materialized view every 5 minutes without blocking
 * readers (REFRESH ... CONCURRENTLY requires the MV's unique index).
 *
 * Multi-instance safety: a Redis SET NX lock ensures only ONE instance runs the
 * refresh per tick (avoids N redundant REFRESH CONCURRENTLY I/O storms). Without
 * Redis (single instance / host dev), the in-process guard is sufficient.
 */
@Injectable()
export class TrendingRefreshService {
  private readonly logger = new Logger(TrendingRefreshService.name);
  private refreshing = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refresh(): Promise<void> {
    if (this.refreshing) return;

    // Distributed lock: skip if another instance already claimed this tick.
    if (this.redis) {
      try {
        const acquired = await this.redis.set(LOCK_KEY, '1', {
          NX: true,
          PX: LOCK_TTL_MS,
        });
        if (acquired !== 'OK') return;
      } catch (error) {
        // If the lock check fails, fall through and rely on the in-process
        // guard + Postgres serialization rather than skipping refreshes.
        this.logger.warn(
          `Trending lock check failed, proceeding locally: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    this.refreshing = true;
    try {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts_mv',
      );
    } catch (error) {
      this.logger.warn(
        `Trending MV refresh failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    } finally {
      this.refreshing = false;
    }
  }
}
