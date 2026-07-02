import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidAffiliateUrl, isValidProductUrl } from '../common/shopee-url';

const DEDUP_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class TrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async trackAndResolve(
    postId: number,
    meta: { ip?: string; userAgent?: string; referer?: string },
  ): Promise<string> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, affiliateUrl: true, productUrl: true },
    });
    if (!post) {
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

    const recentClick = meta.ip
      ? await this.prisma.clickLog.findFirst({
          where: {
            postId,
            ip: meta.ip,
            createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          },
          select: { id: true },
        })
      : null;

    if (!recentClick) {
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
}
