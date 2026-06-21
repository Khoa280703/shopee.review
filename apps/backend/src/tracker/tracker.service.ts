import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
      select: { id: true, userId: true, affiliateUrl: true },
    });
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
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

    return post.affiliateUrl;
  }
}
