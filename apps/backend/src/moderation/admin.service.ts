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

  /** Append-only audit trail of a privileged action. Best-effort: a logging
   * failure must never block the moderation action itself. */
  private async audit(
    actorId: number,
    action: string,
    targetType: string,
    targetId: number,
    detail?: string,
  ): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: { actorId, action, targetType, targetId, detail },
      });
    } catch {
      // swallow — the action already happened; the log is secondary
    }
  }

  listAudit(limit = 50, cursor?: number) {
    return this.prisma.adminAuditLog.findMany({
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
    });
  }

  async resolveReport(id: number, status: ReportStatus, adminId: number) {
    const res = await this.reports.resolve(id, status, adminId);
    await this.audit(adminId, `RESOLVE_REPORT_${status}`, 'REPORT', id);
    return res;
  }

  async deletePost(adminId: number, postId: number) {
    const res = await this.posts.adminRemovePost(postId);
    await this.audit(adminId, 'DELETE_POST', 'POST', postId);
    return res;
  }

  async deleteComment(adminId: number, commentId: number) {
    const res = await this.social.adminDeleteComment(commentId);
    await this.audit(adminId, 'DELETE_COMMENT', 'COMMENT', commentId);
    return res;
  }

  /**
   * Ban a user: set bannedAt + bump tokenVersion. All HTTP requests are rejected
   * immediately (JwtStrategy re-checks per request); an already-open WebSocket is
   * rejected on its next (re)connect, not force-disconnected mid-session — WS rooms
   * are public read-only broadcast, so no privileged data leaks in the interim.
   * Cannot ban yourself or another admin.
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
    await this.audit(adminId, 'BAN_USER', 'USER', targetId);
    return { success: true };
  }

  async unban(adminId: number, targetId: number) {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { bannedAt: null },
    });
    await this.audit(adminId, 'UNBAN_USER', 'USER', targetId);
    return { success: true };
  }
}
