import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_JOB, NOTIFICATION_QUEUE } from '../queue.constants';

interface FanoutJobData {
  actorId: number;
  postId: number;
}

const PAGE = 1000;

// Concurrency 1 — large batch inserts; keep DB pressure predictable.
@Processor(NOTIFICATION_QUEUE, { concurrency: 1 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FanoutJobData>): Promise<void> {
    if (job.name !== NOTIFICATION_JOB.FANOUT) {
      this.logger.warn(`Unknown notification job: ${job.name}`);
      return;
    }

    const { actorId, postId } = job.data;
    let cursor: number | undefined;
    let total = 0;

    // Page through followers and batch-insert NEW_POST notifications.
    for (;;) {
      const followers = await this.prisma.follow.findMany({
        where: { followingId: actorId },
        select: { followerId: true },
        orderBy: { followerId: 'asc' },
        take: PAGE,
        ...(cursor ? { cursor: { followerId_followingId: { followerId: cursor, followingId: actorId } }, skip: 1 } : {}),
      });
      if (followers.length === 0) break;

      await this.prisma.notification.createMany({
        data: followers.map((f) => ({
          recipientId: f.followerId,
          actorId,
          postId,
          type: 'NEW_POST' as const,
        })),
        skipDuplicates: true,
      });

      total += followers.length;
      cursor = followers[followers.length - 1].followerId;
      if (followers.length < PAGE) break;
    }

    this.logger.log(`Fanned out NEW_POST (post ${postId}) to ${total} followers`);
  }
}
