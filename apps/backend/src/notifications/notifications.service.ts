import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type MessageEvent,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { NotificationType } from '@app/database';
import { interval, map, merge, Observable, Subject } from 'rxjs';
import type { RedisClientType } from 'redis';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_JOB, NOTIFICATION_QUEUE } from '../queue/queue.constants';
import { REDIS_CLIENT, type AppRedisClient } from '../redis/redis.module';

// Above this follower count, fan-out runs async via the queue.
const FANOUT_QUEUE_THRESHOLD = 1000;

// Redis channel carrying realtime notifications across instances.
const NOTIF_CHANNEL = 'sse:notifications';

export interface CreateNotificationDto {
  recipientId: number;
  type: NotificationType;
  actorId: number;
  postId?: number;
}

const NOTIFICATION_INCLUDE = {
  actor: { select: { username: true, displayName: true, avatarUrl: true } },
  post: { select: { id: true, title: true } },
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly streams = new Map<number, Subject<MessageEvent>>();
  private readonly logger = new Logger(NotificationsService.name);
  // Dedicated subscriber connection (a Redis client in subscribe mode cannot
  // issue other commands). Only created when Redis is available.
  private subscriber?: RedisClientType;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
    @Optional()
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly fanoutQueue?: Queue,
  ) {}

  /**
   * When Redis is present, subscribe so notifications created on ANY instance
   * are delivered to SSE clients connected to THIS instance. Without Redis
   * (single instance) the in-memory Subject map is sufficient.
   */
  async onModuleInit(): Promise<void> {
    if (!this.redis) return;
    try {
      this.subscriber = this.redis.duplicate();
      await this.subscriber.connect();
      await this.subscriber.subscribe(NOTIF_CHANNEL, (message) => {
        try {
          const { recipientId, notification } = JSON.parse(message) as {
            recipientId: number;
            notification: unknown;
          };
          this.streams
            .get(recipientId)
            ?.next({ data: JSON.stringify(notification) });
        } catch {
          // Ignore malformed messages rather than crash the subscriber.
        }
      });
    } catch (error) {
      this.logger.warn(
        `SSE Redis subscribe failed (falling back to in-memory): ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.subscriber?.unsubscribe(NOTIF_CHANNEL);
      await this.subscriber?.quit();
    } catch {
      // best-effort cleanup
    }
  }

  /** Deliver a notification to its recipient's SSE stream(s) across instances. */
  private async pushToStream(
    recipientId: number,
    notification: unknown,
  ): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.publish(
          NOTIF_CHANNEL,
          JSON.stringify({ recipientId, notification }),
        );
        return;
      } catch (error) {
        this.logger.warn(
          `SSE publish failed, using local stream: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
    this.streams.get(recipientId)?.next({ data: JSON.stringify(notification) });
  }

  /**
   * Notify a user's followers about a new post. For large audiences the work is
   * pushed to the queue (batched inserts); small audiences run inline (KISS).
   */
  async fanoutNewPost(actorId: number, postId: number): Promise<void> {
    try {
      const followerCount = await this.prisma.follow.count({
        where: { followingId: actorId },
      });
      if (followerCount === 0) return;

      if (this.fanoutQueue && followerCount >= FANOUT_QUEUE_THRESHOLD) {
        await this.fanoutQueue.add(NOTIFICATION_JOB.FANOUT, { actorId, postId });
        return;
      }

      const followers = await this.prisma.follow.findMany({
        where: { followingId: actorId },
        select: { followerId: true },
      });
      await this.prisma.notification.createMany({
        data: followers.map((f) => ({
          recipientId: f.followerId,
          actorId,
          postId,
          type: 'NEW_POST' as NotificationType,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      // Fan-out is best-effort; never block post creation.
      this.logger.error(
        `fanoutNewPost failed (actor ${actorId}, post ${postId}): ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async create(dto: CreateNotificationDto) {
    if (dto.recipientId === dto.actorId) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: dto.recipientId,
        type: dto.type,
        actorId: dto.actorId,
        postId: dto.postId,
      },
      include: NOTIFICATION_INCLUDE,
    });

    await this.pushToStream(dto.recipientId, notification);

    return notification;
  }

  createStream(userId: number): Observable<MessageEvent> {
    let subject = this.streams.get(userId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.streams.set(userId, subject);
    }

    const heartbeat = interval(30000).pipe(map((): MessageEvent => ({ data: 'ping' })));
    return merge(subject.asObservable(), heartbeat);
  }

  list(userId: number, limit = 30) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId },
      include: NOTIFICATION_INCLUDE,
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  async unreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, read: false },
    });
    return { count };
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }
}
