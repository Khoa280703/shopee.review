import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const PUBLIC_PROFILE_SELECT = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  totalClicks: true,
  followersCount: true,
  followingCount: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUsername(username: string, viewerId?: number) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        ...PUBLIC_PROFILE_SELECT,
        bannedAt: true,
        _count: { select: { posts: true } },
      },
    });
    // Banned users' profiles are hidden (404). Self can still see own profile.
    if (!user || (user.bannedAt && user.id !== viewerId)) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    let isFollowing = false;
    if (viewerId && viewerId !== user.id) {
      // A block either direction hides the profile from the viewer.
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: user.id },
            { blockerId: user.id, blockedId: viewerId },
          ],
        },
        select: { blockerId: true },
      });
      if (blocked) {
        throw new NotFoundException('Không tìm thấy người dùng');
      }
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
      });
      isFollowing = Boolean(follow);
    }

    const { _count, bannedAt: _bannedAt, ...rest } = user;
    return { ...rest, totalPosts: _count.posts, isFollowing, isSelf: viewerId === user.id };
  }

  /** Lean follow-state lookup for the FollowButton on pages without server auth. */
  async followStatus(username: string, viewerId?: number): Promise<{ following: boolean }> {
    if (!viewerId) return { following: false };
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!target || target.id === viewerId) return { following: false };
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: target.id } },
    });
    return { following: Boolean(follow) };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { ...PUBLIC_PROFILE_SELECT, email: true, emailVerified: true, affiliateId: true },
    });
    return user;
  }

  async getUserPosts(username: string, cursor?: number, limit = 20, hasProduct = false) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const posts = await this.prisma.post.findMany({
      where: {
        userId: user.id,
        ...(hasProduct ? { productMeta: { not: Prisma.DbNull } } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
      include: {
        user: { select: { username: true, displayName: true, avatarUrl: true } },
        category: true,
      },
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async searchUsers(query: string, limit = 20) {
    if (!query?.trim()) {
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: PUBLIC_PROFILE_SELECT,
      take: limit,
    });
  }

  async deleteAccount(userId: number): Promise<{ success: boolean }> {
    // All relations (posts, likes, comments, follows, notifications) are
    // onDelete: Cascade, so a single delete tears down the user's data (GDPR).
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  async getUserStats(userId: number) {
    const [user, totalPosts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { totalClicks: true, followersCount: true, followingCount: true },
      }),
      this.prisma.post.count({ where: { userId } }),
    ]);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return {
      totalClicks: user.totalClicks,
      totalPosts,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
    };
  }
}
