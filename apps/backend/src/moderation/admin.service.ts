import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';
import { SocialService } from '../social/social.service';
import { ReportsService } from './reports.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly social: SocialService,
    private readonly reports: ReportsService,
  ) {}

  listReports(status?: ReportStatus) {
    return this.reports.list(status);
  }

  resolveReport(id: number, status: ReportStatus, adminId: number) {
    return this.reports.resolve(id, status, adminId);
  }

  deletePost(postId: number) {
    return this.posts.adminRemovePost(postId);
  }

  deleteComment(commentId: number) {
    return this.social.adminDeleteComment(commentId);
  }

  /**
   * Ban a user: set bannedAt + bump tokenVersion so every live session (HTTP and
   * WebSocket) is killed immediately. Cannot ban yourself or another admin.
   */
  async ban(adminId: number, targetId: number) {
    if (adminId === targetId) throw new BadRequestException('Không thể tự khóa chính mình');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, isAdmin: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    if (target.isAdmin) throw new BadRequestException('Không thể khóa quản trị viên');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { bannedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async unban(targetId: number) {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { bannedAt: null },
    });
    return { success: true };
  }
}
