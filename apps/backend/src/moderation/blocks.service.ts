import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Block a user. Removes any follow relationship in BOTH directions and
   * decrements the affected counters, then records the block. Idempotent.
   */
  async block(blockerId: number, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    if (target.id === blockerId) throw new BadRequestException('Không thể tự chặn chính mình');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.block.create({ data: { blockerId, blockedId: target.id } });

        // Tear down mutual follows so a blocked user disappears from each
        // other's social graph. Decrement counters only for follows that existed.
        for (const [followerId, followingId] of [
          [blockerId, target.id],
          [target.id, blockerId],
        ] as const) {
          const existing = await tx.follow.findUnique({
            where: { followerId_followingId: { followerId, followingId } },
          });
          if (!existing) continue;
          await tx.follow.delete({
            where: { followerId_followingId: { followerId, followingId } },
          });
          await tx.user.update({
            where: { id: followingId },
            data: { followersCount: { decrement: 1 } },
          });
          await tx.user.update({
            where: { id: followerId },
            data: { followingCount: { decrement: 1 } },
          });
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { blocked: true };
      }
      throw e;
    }
    return { blocked: true };
  }

  async unblock(blockerId: number, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Không tìm thấy người dùng');
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedId: target.id },
    });
    return { blocked: false };
  }

  async listBlocked(blockerId: number) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId },
      include: { blocked: { select: { username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return blocks.map((b) => b.blocked);
  }

  /** True if either user has blocked the other. */
  async isBlockedEitherWay(a: number, b: number): Promise<boolean> {
    if (a === b) return false;
    const found = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    return Boolean(found);
  }

  /** All user ids blocked by, or blocking, this user (for feed exclusion). */
  async getBlockedUserIds(userId: number): Promise<number[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<number>();
    for (const r of rows) {
      ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    }
    return [...ids];
  }

  /** Guard for write interactions (comment, follow, reaction, bookmark). */
  async assertNotBlocked(viewerId: number, authorId: number): Promise<void> {
    if (await this.isBlockedEitherWay(viewerId, authorId)) {
      throw new ForbiddenException('Không thể tương tác do đã chặn');
    }
  }
}
