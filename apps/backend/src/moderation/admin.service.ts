import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus, ReportTargetType } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_AUTHOR_SELECT } from '../common/user-select';
import { PostsService } from '../posts/posts.service';
import { SocialService } from '../social/social.service';
import { MeilisearchService } from '../search/meilisearch.service';
import { ReportsService } from './reports.service';

/** Shape shared by both deleted-content list endpoints below. */
const DELETER_SELECT = { username: true, displayName: true } as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly social: SocialService,
    private readonly reports: ReportsService,
    private readonly meili: MeilisearchService,
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

  async deletePost(adminId: number, postId: number, reason?: string) {
    const res = await this.posts.adminRemovePost(adminId, postId, reason);
    await this.audit(adminId, 'DELETE_POST', 'POST', postId, reason);
    await this.reports.autoResolve(ReportTargetType.POST, postId, adminId);
    return res;
  }

  async restorePost(adminId: number, postId: number) {
    const res = await this.posts.restorePost(postId);
    await this.audit(adminId, 'RESTORE_POST', 'POST', postId);
    return res;
  }

  async deleteComment(adminId: number, commentId: number, reason?: string) {
    const res = await this.social.adminDeleteComment(adminId, commentId, reason);
    await this.audit(adminId, 'DELETE_COMMENT', 'COMMENT', commentId, reason);
    await this.reports.autoResolve(ReportTargetType.COMMENT, commentId, adminId);
    return res;
  }

  async restoreComment(adminId: number, commentId: number) {
    const res = await this.social.restoreComment(commentId);
    await this.audit(adminId, 'RESTORE_COMMENT', 'COMMENT', commentId);
    return res;
  }

  /** Paginated "Đã xoá" list for the admin UI — the only way to find a
   * soft-deleted post/comment that ISN'T already known by id from a report. */
  async listDeletedPosts(limit = 20, cursor?: number) {
    const posts = await this.prisma.post.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        deleteReason: true,
        user: { select: PUBLIC_AUTHOR_SELECT },
        deletedBy: { select: DELETER_SELECT },
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async listDeletedComments(limit = 20, cursor?: number) {
    const comments = await this.prisma.comment.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        content: true,
        postId: true,
        deletedAt: true,
        deleteReason: true,
        user: { select: PUBLIC_AUTHOR_SELECT },
        deletedBy: { select: DELETER_SELECT },
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = comments.length > limit;
    const data = hasMore ? comments.slice(0, limit) : comments;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  /** Paginated "Tài khoản bị khoá" list for the admin UI (M4) — otherwise a
   * suspended/banned user is only discoverable from the report that led to
   * the action, with no way back to unsuspend/unban them later. */
  async listLockedUsers(limit = 20, cursor?: number) {
    const users = await this.prisma.user.findMany({
      where: { OR: [{ suspendedAt: { not: null } }, { bannedAt: { not: null } }] },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        suspendedAt: true,
        bannedAt: true,
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = users.length > limit;
    const data = hasMore ? users.slice(0, limit) : users;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  private async assertBannableTarget(adminId: number, targetId: number): Promise<void> {
    if (adminId === targetId) throw new BadRequestException('Không thể tự khóa chính mình');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, isAdmin: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    if (target.isAdmin) throw new BadRequestException('Không thể khóa quản trị viên');
  }

  /**
   * Level 1 moderation: locks login only — content stays visible. Bumping
   * tokenVersion invalidates every existing JWT on its next request; deleting
   * sessions clears the "active sessions" list immediately rather than leaving
   * stale rows that are merely inert.
   */
  async suspend(adminId: number, targetId: number) {
    await this.assertBannableTarget(adminId, targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { suspendedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    await this.prisma.session.deleteMany({ where: { userId: targetId } });
    await this.audit(adminId, 'SUSPEND_USER', 'USER', targetId);
    await this.reports.autoResolve(ReportTargetType.USER, targetId, adminId);
    return { success: true };
  }

  async unsuspend(adminId: number, targetId: number) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    await this.prisma.user.update({ where: { id: targetId }, data: { suspendedAt: null } });
    await this.audit(adminId, 'UNSUSPEND_USER', 'USER', targetId);
    return { success: true };
  }

  /**
   * Level 2 moderation: locks login (same as suspend) AND hides every post/
   * comment the user authored (PostsService/SocialService visibility filters
   * key off `user.bannedAt`) + 404s their /r/:postId redirect. The Meilisearch
   * index isn't moderation-aware on its own, so their posts are explicitly
   * pulled from it here (best-effort — Postgres-side filtering in
   * SearchService.loadPostsByIds is the authoritative backstop).
   * Cannot ban yourself or another admin.
   */
  async ban(adminId: number, targetId: number) {
    await this.assertBannableTarget(adminId, targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { bannedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    await this.prisma.session.deleteMany({ where: { userId: targetId } });
    await this.syncBannedUserSearchIndex(targetId, 'hide');
    await this.audit(adminId, 'BAN_USER', 'USER', targetId);
    await this.reports.autoResolve(ReportTargetType.USER, targetId, adminId);
    return { success: true };
  }

  async unban(adminId: number, targetId: number) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    await this.prisma.user.update({ where: { id: targetId }, data: { bannedAt: null } });
    await this.syncBannedUserSearchIndex(targetId, 'restore');
    await this.audit(adminId, 'UNBAN_USER', 'USER', targetId);
    return { success: true };
  }

  private async syncBannedUserSearchIndex(userId: number, op: 'hide' | 'restore'): Promise<void> {
    try {
      const posts = await this.prisma.post.findMany({
        where: { userId, deletedAt: null },
        select: { id: true },
      });
      const ids = posts.map((p) => p.id);
      if (op === 'hide') await this.meili.deletePosts(ids);
      else await this.meili.reindexPosts(ids);
    } catch {
      // Best-effort — Postgres-side filtering is the authoritative backstop.
    }
  }

  /** Grant or revoke the verified ("blue tick") badge on a user. */
  async setVerified(adminId: number, targetId: number, verified: boolean) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    await this.prisma.user.update({ where: { id: targetId }, data: { verified } });
    await this.audit(adminId, verified ? 'VERIFY_USER' : 'UNVERIFY_USER', 'USER', targetId);
    return { success: true, verified };
  }
}
