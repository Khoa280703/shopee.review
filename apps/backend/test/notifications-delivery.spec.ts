import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service';

function makeService(
  prismaOverrides: Record<string, unknown> = {},
  fanoutQueue?: { add: ReturnType<typeof vi.fn> },
) {
  const prisma = {
    follow: { count: vi.fn(), findMany: vi.fn() },
    notification: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    ...prismaOverrides,
  };
  const service = new NotificationsService(prisma as never, null as never, fanoutQueue as never);
  return { service, prisma };
}

describe('NotificationsService.markRead', () => {
  it('marks a notification read when the caller owns it', async () => {
    const { service, prisma } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.markRead(1, 5);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: BigInt(5), recipientId: 1 },
      data: { read: true },
    });
    expect(result).toEqual({ success: true });
  });

  it('404s instead of silently succeeding for someone else\'s notification', async () => {
    const { service, prisma } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.markRead(1, 5)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('NotificationsService.unreadCount / markAllRead', () => {
  it('counts only this recipient\'s unread notifications', async () => {
    const { service, prisma } = makeService();
    prisma.notification.count.mockResolvedValue(3);
    await expect(service.unreadCount(7)).resolves.toEqual({ count: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { recipientId: 7, read: false },
    });
  });

  it('marks every unread notification for the recipient as read', async () => {
    const { service, prisma } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });
    await expect(service.markAllRead(7)).resolves.toEqual({ success: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 7, read: false },
      data: { read: true },
    });
  });
});

describe('NotificationsService.fanoutNewPost', () => {
  it('is a no-op when the author has no followers', async () => {
    const { service, prisma } = makeService();
    prisma.follow.count.mockResolvedValue(0);
    await service.fanoutNewPost(1, 10);
    expect(prisma.follow.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('inserts inline (createMany, deduped) for a small follower count', async () => {
    const { service, prisma } = makeService();
    prisma.follow.count.mockResolvedValue(2);
    prisma.follow.findMany.mockResolvedValue([{ followerId: 2 }, { followerId: 3 }]);
    await service.fanoutNewPost(1, 10);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { recipientId: 2, actorId: 1, postId: 10, type: 'NEW_POST' },
        { recipientId: 3, actorId: 1, postId: 10, type: 'NEW_POST' },
      ],
      skipDuplicates: true,
    });
  });

  it('defers to the queue instead of inserting inline above the follower threshold', async () => {
    const add = vi.fn();
    const { service, prisma } = makeService({}, { add });
    prisma.follow.count.mockResolvedValue(5000);
    await service.fanoutNewPost(1, 10);
    expect(add).toHaveBeenCalledWith('fanout', { actorId: 1, postId: 10 });
    expect(prisma.follow.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('never throws out of post creation — a DB error is swallowed (best-effort)', async () => {
    const { service, prisma } = makeService();
    prisma.follow.count.mockRejectedValue(new Error('db down'));
    await expect(service.fanoutNewPost(1, 10)).resolves.toBeUndefined();
  });
});
