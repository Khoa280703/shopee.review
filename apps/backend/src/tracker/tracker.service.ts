import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidAffiliateUrl, isValidProductUrl } from '../common/shopee-url';
import { REDIS_CLIENT, type AppRedisClient } from '../redis/redis.module';

const DEDUP_WINDOW_MS = 60 * 60 * 1000;
const DEDUP_WINDOW_SEC = DEDUP_WINDOW_MS / 1000;

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
  ) {}

  async trackAndResolve(
    postId: number,
    meta: { ip?: string; userAgent?: string; referer?: string },
  ): Promise<string> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        affiliateUrl: true,
        productUrl: true,
        deletedAt: true,
        user: { select: { bannedAt: true } },
      },
    });
    // A soft-deleted post or a banned author's post: 404, no click recorded —
    // the affiliate link must not keep earning commission once removed.
    if (!post || post.deletedAt || post.user.bannedAt) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    // Validate the redirect target BEFORE any click write (no counter pumping on
    // a rejected URL). New posts are validated at create time, but legacy rows
    // may hold a dirty affiliateUrl — fall back to the product URL (degraded:
    // the user loses commission on that click) rather than a hard failure.
    let redirectUrl: string;
    if (isValidAffiliateUrl(post.affiliateUrl)) {
      redirectUrl = post.affiliateUrl;
    } else if (isValidProductUrl(post.productUrl)) {
      redirectUrl = post.productUrl;
    } else {
      throw new BadRequestException('Link bài viết không hợp lệ');
    }

    const shouldRecord = meta.ip ? await this.claimDedup(postId, meta.ip) : true;

    if (shouldRecord) {
      await this.prisma.$transaction([
        this.prisma.clickLog.create({
          data: {
            postId,
            ip: meta.ip,
            userAgent: meta.userAgent,
            referer: meta.referer,
          },
        }),
        this.prisma.post.update({
          where: { id: postId },
          data: { clickCount: { increment: 1 } },
        }),
        this.prisma.user.update({
          where: { id: post.userId },
          data: { totalClicks: { increment: 1 } },
        }),
      ]);
    }

    return redirectUrl;
  }

  /**
   * Atomically claims the 1h/IP dedup window. Returns true the FIRST time
   * (click should be recorded), false on every repeat within the window.
   *
   * Redis `SET NX EX` is a single atomic command, so two concurrent requests
   * for the same (postId, ip) can never both win — unlike the previous
   * read-then-write (SELECT recent click, then INSERT), which raced: two
   * requests arriving within the same millisecond could both see "no recent
   * click" and both insert, double-counting the click and the commission.
   * Falls back to the old read-then-write against Postgres when Redis is
   * unavailable (host dev / Redis outage) — degraded but still functional.
   */
  private async claimDedup(postId: number, ip: string): Promise<boolean> {
    if (this.redis) {
      try {
        const claimed = await this.redis.set(`click:${postId}:${ip}`, '1', {
          NX: true,
          EX: DEDUP_WINDOW_SEC,
        });
        return claimed === 'OK';
      } catch (error) {
        this.logger.warn(
          `Click dedup Redis claim failed, falling back to DB check: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
    const recentClick = await this.prisma.clickLog.findFirst({
      where: { postId, ip, createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
      select: { id: true },
    });
    return !recentClick;
  }
}
