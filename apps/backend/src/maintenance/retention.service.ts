import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT, type AppRedisClient } from '../redis/redis.module';

const LOCK_KEY = 'lock:data-retention';
const LOCK_TTL_MS = 30 * 60 * 1000;

// Retention windows. click_logs holds PII (IP/UA/referer) and both tables grow
// unbounded, so age them out. click_logs: 90d is well beyond the 1h click-dedup
// window and keeps a quarter of analytics history. notifications: only READ ones
// are pruned (unread stay until seen), after 30d.
const CLICK_LOG_RETENTION_DAYS = 90;
const READ_NOTIFICATION_RETENTION_DAYS = 30;

/**
 * Nightly retention sweep: caps unbounded-growth tables and expires stored PII.
 * DELETEs are idempotent (age-filtered), so running on more than one instance is
 * harmless; a Redis lock still avoids redundant work when available.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<void> {
    if (this.redis) {
      try {
        const acquired = await this.redis.set(LOCK_KEY, '1', { NX: true, PX: LOCK_TTL_MS });
        if (acquired !== 'OK') return;
      } catch {
        // proceed — an occasional double-run of idempotent DELETEs is fine
      }
    }

    try {
      const { clickLogs, notifications } = await this.runRetention();
      if (clickLogs > 0 || notifications > 0) {
        this.logger.log(
          `Retention swept ${clickLogs} click_logs and ${notifications} read notifications`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Retention sweep failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Exposed for manual/admin invocation and tests. */
  async runRetention(): Promise<{ clickLogs: number; notifications: number }> {
    const now = Date.now();
    const clickCutoff = new Date(now - CLICK_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const notifCutoff = new Date(now - READ_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const clicks = await this.prisma.clickLog.deleteMany({
      where: { createdAt: { lt: clickCutoff } },
    });
    const notifs = await this.prisma.notification.deleteMany({
      where: { read: true, createdAt: { lt: notifCutoff } },
    });

    return { clickLogs: clicks.count, notifications: notifs.count };
  }
}
