import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Follows ----------
  async follow(followerId: number, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    if (target.id === followerId) throw new BadRequestException('Không thể tự theo dõi chính mình');

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });
    if (existing) return { following: true };

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

  async listFollowers(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    const follows = await this.prisma.follow.findMany({
      where: { followingId: user.id },
      include: {
        follower: { select: { username: true, displayName: true, avatarUrl: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return follows.map((f) => f.follower);
  }

  async listFollowing(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    const follows = await this.prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: { select: { username: true, displayName: true, avatarUrl: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return follows.map((f) => f.following);
  }

  // ---------- Likes ----------
  async likePost(userId: number, postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');

    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) return { liked: true };

    await this.prisma.$transaction([
      this.prisma.like.create({ data: { userId, postId } }),
      this.prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);

    await this.notifications.create({
      recipientId: post.userId,
      type: 'LIKE',
      actorId: userId,
      postId,
    });

    return { liked: true };
  }

  async unlikePost(userId: number, postId: number) {
    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (!existing) return { liked: false };

    await this.prisma.$transaction([
      this.prisma.like.delete({ where: { userId_postId: { userId, postId } } }),
      this.prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
    ]);

    return { liked: false };
  }

  async likeStatus(postId: number, userId?: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { likeCount: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');

    let isLiked = false;
    if (userId) {
      const like = await this.prisma.like.findUnique({
        where: { userId_postId: { userId, postId } },
      });
      isLiked = Boolean(like);
    }
    return { count: post.likeCount, isLiked };
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
          include: {
            user: { select: { username: true, displayName: true, avatarUrl: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    const hasMore = comments.length > limit;
    const data = hasMore ? comments.slice(0, limit) : comments;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async addComment(userId: number, postId: number, content: string, parentId?: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');

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

    const replyCount = await this.prisma.comment.count({ where: { parentId: commentId } });

    await this.prisma.$transaction([
      this.prisma.comment.delete({ where: { id: commentId } }),
      this.prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 + replyCount } },
      }),
    ]);

    return { success: true };
  }
}
