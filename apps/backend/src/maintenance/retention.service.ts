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
// Hard cap for ALL notifications (even unread): a user who abandons the app
// would otherwise accumulate unread NEW_POST rows forever.
const NOTIFICATION_MAX_AGE_DAYS = 90;
// Match the JWT cookie lifetime (30d): a session older than that already has a
// dead token, so the row is pure noise (and stale PII) — and it would otherwise
// linger in the user's "active sessions" list forever.
const SESSION_RETENTION_DAYS = 30;

// click_logs is the high-insert table; deleting a whole backlog (e.g. the first
// sweep, or after the cron missed a few days) in one statement takes a long lock
// and bloats WAL. Delete in bounded chunks so each transaction is short.
const CLICK_LOG_DELETE_BATCH = 10_000;

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
      const { clickLogs, notifications, sessions } = await this.runRetention();
      if (clickLogs > 0 || notifications > 0 || sessions > 0) {
        this.logger.log(
          `Retention swept ${clickLogs} click_logs, ${notifications} read notifications, ${sessions} expired sessions`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Retention sweep failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Exposed for manual/admin invocation and tests. */
  async runRetention(): Promise<{ clickLogs: number; notifications: number; sessions: number }> {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const clickCutoff = new Date(now - CLICK_LOG_RETENTION_DAYS * day);
    const notifCutoff = new Date(now - READ_NOTIFICATION_RETENTION_DAYS * day);
    const notifMaxCutoff = new Date(now - NOTIFICATION_MAX_AGE_DAYS * day);
    const sessionCutoff = new Date(now - SESSION_RETENTION_DAYS * day);

    const clickLogs = await this.deleteClickLogsInBatches(clickCutoff);
    // Read notifications after 30d, plus any notification (read or not) past 90d.
    const notifs = await this.prisma.notification.deleteMany({
      where: {
        OR: [
          { read: true, createdAt: { lt: notifCutoff } },
          { createdAt: { lt: notifMaxCutoff } },
        ],
      },
    });
    const sessions = await this.prisma.session.deleteMany({
      where: { createdAt: { lt: sessionCutoff } },
    });

    return { clickLogs, notifications: notifs.count, sessions: sessions.count };
  }

  /** Delete aged click_logs in bounded chunks to keep each lock/transaction short. */
  private async deleteClickLogsInBatches(cutoff: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM click_logs
        WHERE id IN (
          SELECT id FROM click_logs
          WHERE created_at < ${cutoff}
          ORDER BY id
          LIMIT ${CLICK_LOG_DELETE_BATCH}
        )`;
      total += deleted;
      if (deleted < CLICK_LOG_DELETE_BATCH) break;
    }
    return total;
  }
}
