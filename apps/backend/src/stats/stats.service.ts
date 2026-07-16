import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ChartRow {
  date: Date;
  clicks: bigint;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPostStats(userId: number) {
    const posts = await this.prisma.post.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        clickCount: true,
        likeCount: true,
        commentCount: true,
        createdAt: true,
      },
      orderBy: { clickCount: 'desc' },
      // Cap the dashboard payload: a prolific author could have thousands of
      // posts, and returning them all on every dashboard open is wasteful. The
      // top 500 by clicks is far beyond what the UI shows.
      take: 500,
    });
    return posts;
  }

  async getClicksChart(userId: number, days = 7) {
    const rows = await this.prisma.$queryRaw<ChartRow[]>`
      SELECT DATE(cl.created_at) as date, COUNT(*)::bigint as clicks
      FROM click_logs cl
      JOIN posts p ON cl.post_id = p.id
      WHERE p.user_id = ${userId}
        AND cl.created_at >= NOW() - (${days} || ' days')::interval
      GROUP BY DATE(cl.created_at)
      ORDER BY date ASC
    `;

    const data = rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      clicks: Number(r.clicks),
    }));
    const total = data.reduce((sum, d) => sum + d.clicks, 0);

    return { period: `${days}d`, data, total };
  }
}
