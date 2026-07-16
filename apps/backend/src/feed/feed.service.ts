import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_AUTHOR_SELECT } from '../common/user-select';
import { BlocksService } from '../moderation/blocks.service';

// Short TTL: feed is personalized + write-heavy, so 30s smooths bursty reads
// (the WHERE EXISTS follow subquery is the expensive part) without going stale.
const FEED_CACHE_TTL_MS = 30_000;

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly blocks: BlocksService,
  ) {}

  async getFeed(userId: number, cursor?: number, limit = 20) {
    const key = `feed:${userId}:${cursor ?? 'head'}:${limit}`;
    // Cache is best-effort: a Redis error (e.g. the shared noeviction instance
    // filling up) must DEGRADE to a direct DB read, never 500 the whole feed.
    try {
      const hit = await this.cache.get<Awaited<ReturnType<FeedService['queryFeed']>>>(key);
      if (hit) return hit;
    } catch (e) {
      this.logger.warn(`cache get failed for ${key}: ${e instanceof Error ? e.message : e}`);
    }

    const result = await this.queryFeed(userId, cursor, limit);
    // Don't pin an empty feed for the full TTL: a user who just followed someone
    // would otherwise see nothing until it expires.
    if (result.data.length > 0) {
      try {
        await this.cache.set(key, result, FEED_CACHE_TTL_MS);
      } catch (e) {
        this.logger.warn(`cache set failed for ${key}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return result;
  }

  private async queryFeed(userId: number, cursor?: number, limit = 20) {
    // Exclude posts by users blocked either direction (feed cache is per-user).
    const blockedIds = await this.blocks.getBlockedUserIds(userId);
    const posts = await this.prisma.post.findMany({
      where: {
        user: { followers: { some: { followerId: userId } } },
        ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
      },
      include: {
        user: { select: PUBLIC_AUTHOR_SELECT },
        category: true,
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }
}
