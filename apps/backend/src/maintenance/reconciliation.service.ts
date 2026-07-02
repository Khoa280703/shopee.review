import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT, type AppRedisClient } from '../redis/redis.module';

const LOCK_KEY = 'lock:counter-reconcile';
const LOCK_TTL_MS = 30 * 60 * 1000; // 30 min — well over the job's runtime

/**
 * Denormalized counters (likeCount, commentCount, followersCount,
 * followingCount) are maintained transactionally, but crashes mid-transaction
 * or manual data edits can cause slow drift. This nightly job reconciles them
 * against the source-of-truth rows with set-based UPDATEs (only touching rows
 * that actually drifted). Distributed-locked so it runs on one instance.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reconcile(): Promise<void> {
    if (this.redis) {
      try {
        const acquired = await this.redis.set(LOCK_KEY, '1', {
          NX: true,
          PX: LOCK_TTL_MS,
        });
        if (acquired !== 'OK') return;
      } catch {
        // proceed — better to run on all instances than skip entirely
      }
    }

    try {
      const affected = await this.runReconciliation();
      if (affected > 0) {
        this.logger.log(`Counter reconciliation fixed ${affected} drifted rows`);
      }
    } catch (error) {
      this.logger.error(
        `Counter reconciliation failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Exposed for manual/admin invocation and tests. Returns rows corrected. */
  async runReconciliation(): Promise<number> {
    let total = 0;

    // posts.like_count
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE posts p SET like_count = c.cnt
      FROM (SELECT post_id, COUNT(*)::int AS cnt FROM likes GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.like_count <> c.cnt
    `);
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE posts p SET like_count = 0
      WHERE p.like_count <> 0 AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id)
    `);

    // posts.comment_count (parents + replies)
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE posts p SET comment_count = c.cnt
      FROM (SELECT post_id, COUNT(*)::int AS cnt FROM comments GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.comment_count <> c.cnt
    `);
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE posts p SET comment_count = 0
      WHERE p.comment_count <> 0 AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.post_id = p.id)
    `);

    // users.followers_count (people following this user)
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE users u SET followers_count = f.cnt
      FROM (SELECT following_id, COUNT(*)::int AS cnt FROM follows GROUP BY following_id) f
      WHERE u.id = f.following_id AND u.followers_count <> f.cnt
    `);
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE users u SET followers_count = 0
      WHERE u.followers_count <> 0 AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.following_id = u.id)
    `);

    // users.following_count (people this user follows)
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE users u SET following_count = f.cnt
      FROM (SELECT follower_id, COUNT(*)::int AS cnt FROM follows GROUP BY follower_id) f
      WHERE u.id = f.follower_id AND u.following_count <> f.cnt
    `);
    total += await this.prisma.$executeRawUnsafe(`
      UPDATE users u SET following_count = 0
      WHERE u.following_count <> 0 AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id)
    `);

    return total;
  }
}
