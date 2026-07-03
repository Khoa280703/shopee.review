import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ReactionType } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BlocksService } from '../moderation/blocks.service';
import { SocialGateway } from './social.gateway';

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

function isNotFound(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'
  );
}

const REPLIES_PAGE_SIZE = 10;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: SocialGateway,
    private readonly blocks: BlocksService,
  ) {}

  // ---------- Follows ----------
  async follow(followerId: number, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    if (target.id === followerId) throw new BadRequestException('Không thể tự theo dõi chính mình');
    // A blocked user (either direction) must not be able to re-follow — else
    // block is bypassable and becomes a notification-spam vector.
    await this.blocks.assertNotBlocked(followerId, target.id);

    // The @@id([followerId, followingId]) constraint is the source of truth.
    // Concurrent requests resolve via P2002 → idempotent, no double counter.
    try {
      await this.prisma.$transaction([
        this.prisma.follow.create({ data: { followerId, followingId: target.id } }),
        this.prisma.user.update({
          where: { id: target.id },
          data: { followersCount: { increment: 1 } },
        }),
        this.prisma.user.update({
          where: { id: followerId },
          data: { followingCount: { increment: 1 } },
        }),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) return { following: true };
      throw e;
    }

    await this.notifications.create({
      recipientId: target.id,
      type: 'FOLLOW',
      actorId: followerId,
    });

    return { following: true };
  }

  async unfollow(followerId: number, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });
    if (!existing) return { following: false };

    await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: { followerId_followingId: { followerId, followingId: target.id } },
      }),
      this.prisma.user.update({
        where: { id: target.id },
        data: { followersCount: { decrement: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);

    return { following: false };
  }

  async listFollowers(username: string, page = 1, limit = 30) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    // Offset pagination: `follows` has a composite PK and no serial id, so a
    // monotonic cursor isn't available. page/limit is correct and adequate here.
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const follows = await this.prisma.follow.findMany({
      where: { followingId: user.id },
      include: {
        follower: { select: { username: true, displayName: true, avatarUrl: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
    });
    const hasMore = follows.length > take;
    const data = (hasMore ? follows.slice(0, take) : follows).map((f) => f.follower);
    return { data, nextPage: hasMore ? page + 1 : null };
  }

  async listFollowing(username: string, page = 1, limit = 30) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const follows = await this.prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: { select: { username: true, displayName: true, avatarUrl: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
    });
    const hasMore = follows.length > take;
    const data = (hasMore ? follows.slice(0, take) : follows).map((f) => f.following);
    return { data, nextPage: hasMore ? page + 1 : null };
  }

  // ---------- Reactions ----------
  // likeCount on Post is the TOTAL reaction count, maintained with atomic
  // increment/decrement (no read-modify-write). Per-type counts are aggregated
  // on read from the (post_id, type) index — no denormalized JSON to drift.
  private async reactionCounts(postId: number): Promise<Record<string, number>> {
    const rows = await this.prisma.reaction.groupBy({
      by: ['type'],
      where: { postId },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.type, r._count._all]));
  }

  /** Upsert a reaction. Same type again toggles it off. Atomic counter math. */
  async react(userId: number, postId: number, type: ReactionType) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    await this.blocks.assertNotBlocked(userId, post.userId);

    const existing = await this.prisma.reaction.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { type: true },
    });

    let reacted: ReactionType | null;
    if (!existing) {
      // Concurrent double-tap: two requests both see no existing reaction; the
      // second create hits the PK (P2002). Swallow → idempotent (counter stays
      // correct because only the first create+increment committed).
      try {
        await this.prisma.$transaction([
          this.prisma.reaction.create({ data: { userId, postId, type } }),
          this.prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
        ]);
        await this.notifications.create({
          recipientId: post.userId,
          type: 'LIKE',
          actorId: userId,
          postId,
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      reacted = type;
    } else if (existing.type === type) {
      // Same reaction → remove (toggle off). A concurrent second toggle deletes
      // an already-deleted row (P2025) → treat as idempotent no-op.
      try {
        await this.prisma.$transaction([
          this.prisma.reaction.delete({ where: { userId_postId: { userId, postId } } }),
          this.prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
        ]);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
      reacted = null;
    } else {
      // Switch type — total unchanged.
      await this.prisma.reaction.update({
        where: { userId_postId: { userId, postId } },
        data: { type },
      });
      reacted = type;
    }

    const counts = await this.reactionCounts(postId);
    this.gateway.emitReactionUpdate(postId, counts);
    return { type: reacted, counts };
  }

  async reactionStatus(postId: number, userId?: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');

    let type: ReactionType | null = null;
    if (userId) {
      const r = await this.prisma.reaction.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { type: true },
      });
      type = r?.type ?? null;
    }
    return { type, counts: await this.reactionCounts(postId) };
  }

  // ---------- Bookmarks ----------
  async toggleBookmark(userId: number, postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    await this.blocks.assertNotBlocked(userId, post.userId);

    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) {
      await this.prisma.bookmark.delete({ where: { userId_postId: { userId, postId } } });
      return { bookmarked: false };
    }
    try {
      await this.prisma.bookmark.create({ data: { userId, postId } });
    } catch (e) {
      if (isUniqueViolation(e)) return { bookmarked: true };
      throw e;
    }
    return { bookmarked: true };
  }

  async listBookmarks(userId: number, cursor?: number, limit = 20) {
    const rows = await this.prisma.bookmark.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 } : {}),
      // Secondary sort by postId gives a total order so keyset pagination is
      // stable even when two bookmarks share the same createdAt millisecond.
      orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
      include: {
        post: {
          include: {
            user: { select: { username: true, displayName: true, avatarUrl: true } },
            category: true,
          },
        },
      },
    });
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: sliced.map((b) => b.post),
      nextCursor: hasMore ? sliced[sliced.length - 1].postId : null,
    };
  }

  // ---------- Share ----------
  async share(postId: number) {
    const post = await this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    }).catch(() => null);
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    return { shareCount: post.shareCount };
  }

  // ---------- Comments ----------
  async getComments(postId: number, cursor?: number, limit = 20) {
    const comments = await this.prisma.comment.findMany({
      where: { postId, parentId: null },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
      include: {
        user: { select: { username: true, displayName: true, avatarUrl: true } },
        replies: {
          take: REPLIES_PAGE_SIZE,
          orderBy: { id: 'asc' },
          include: {
            user: { select: { username: true, displayName: true, avatarUrl: true } },
          },
        },
        _count: { select: { replies: true } },
      },
    });

    const hasMore = comments.length > limit;
    const sliced = hasMore ? comments.slice(0, limit) : comments;
    const data = sliced.map(({ _count, ...c }) => ({
      ...c,
      replyCount: _count.replies,
    }));
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async getReplies(
    postId: number,
    parentId: number,
    cursor?: number,
    limit = REPLIES_PAGE_SIZE,
  ) {
    // Ensure the parent actually belongs to this post (prevent cross-post enumeration).
    const parent = await this.prisma.comment.findUnique({
      where: { id: parentId },
      select: { postId: true },
    });
    if (!parent || parent.postId !== postId) {
      throw new NotFoundException('Không tìm thấy bình luận gốc');
    }

    const replies = await this.prisma.comment.findMany({
      where: { postId, parentId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      include: {
        user: { select: { username: true, displayName: true, avatarUrl: true } },
      },
    });

    const hasMore = replies.length > limit;
    const data = hasMore ? replies.slice(0, limit) : replies;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async addComment(userId: number, postId: number, content: string, parentId?: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');

    // A blocked user (either direction) can't comment on the author's post.
    await this.blocks.assertNotBlocked(userId, post.userId);

    if (parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, parentId: true },
      });
      if (!parent || parent.postId !== postId) {
        throw new BadRequestException('Bình luận gốc không hợp lệ');
      }
      if (parent.parentId) {
        throw new BadRequestException('Chỉ hỗ trợ trả lời 1 cấp');
      }
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: { userId, postId, content, parentId },
        include: { user: { select: { username: true, displayName: true, avatarUrl: true } } },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    // Broadcast to everyone viewing the post (clients dedup by id).
    this.gateway.emitNewComment(postId, comment);

    await this.notifications.create({
      recipientId: post.userId,
      type: 'COMMENT',
      actorId: userId,
      postId,
    });

    return comment;
  }

  async deleteComment(userId: number, commentId: number) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, postId: true },
    });
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận');
    if (comment.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa bình luận này');
    }
    return this.deleteCommentCore(comment.id, comment.postId);
  }

  /** Admin deletion — no ownership check (caller is behind AdminGuard). */
  async adminDeleteComment(commentId: number) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true },
    });
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận');
    return this.deleteCommentCore(comment.id, comment.postId);
  }

  // Shared deletion side-effects (delete + counter decrement incl. replies +
  // broadcast). Ownership enforced by callers, not a bypass flag.
  private async deleteCommentCore(commentId: number, postId: number) {
    const replyCount = await this.prisma.comment.count({ where: { parentId: commentId } });

    await this.prisma.$transaction([
      this.prisma.comment.delete({ where: { id: commentId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentCount: { decrement: 1 + replyCount } },
      }),
    ]);

    this.gateway.emitCommentDeleted(postId, commentId);

    return { success: true };
  }
}
