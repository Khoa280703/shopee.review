import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

// Short TTL: feed is personalized + write-heavy, so 30s smooths bursty reads
// (the WHERE EXISTS follow subquery is the expensive part) without going stale.
const FEED_CACHE_TTL_MS = 30_000;

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getFeed(userId: number, cursor?: number, limit = 20) {
    const key = `feed:${userId}:${cursor ?? 'head'}:${limit}`;
    const hit = await this.cache.get<Awaited<ReturnType<FeedService['queryFeed']>>>(key);
    if (hit) return hit;

    const result = await this.queryFeed(userId, cursor, limit);
    await this.cache.set(key, result, FEED_CACHE_TTL_MS);
    return result;
  }

  private async queryFeed(userId: number, cursor?: number, limit = 20) {
    const posts = await this.prisma.post.findMany({
      where: { user: { followers: { some: { followerId: userId } } } },
      include: {
        user: { select: { username: true, displayName: true, avatarUrl: true } },
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
