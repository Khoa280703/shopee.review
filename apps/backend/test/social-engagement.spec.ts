import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@app/database';
import { SocialService } from '../src/social/social.service';

function makeService(prismaOverrides: Record<string, unknown>) {
  const prisma = {
    post: { findUnique: vi.fn(), update: vi.fn() },
    reaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([{ type: 'LIKE', _count: { _all: 3 } }]),
    },
    bookmark: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
    ...prismaOverrides,
  };
  const notifications = { create: vi.fn().mockResolvedValue(null) };
  const gateway = { emitReactionUpdate: vi.fn() };
  const blocks = { assertNotBlocked: vi.fn().mockResolvedValue(undefined) };
  const service = new SocialService(
    prisma as never,
    notifications as never,
    gateway as never,
    blocks as never,
  );
  return { service, prisma, gateway, blocks, notifications };
}

describe('SocialService.react', () => {
  it('creates a reaction and increments the counter when none exists', async () => {
    const { service, prisma, gateway } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    prisma.reaction.findUnique.mockResolvedValue(null);

    const res = await service.react(1, 1, 'LOVE' as never);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(res.type).toBe('LOVE');
    expect(gateway.emitReactionUpdate).toHaveBeenCalled();
  });

  it('toggles OFF when reacting with the same type again', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    prisma.reaction.findUnique.mockResolvedValue({ type: 'LIKE' });

    const res = await service.react(1, 1, 'LIKE' as never);
    expect(res.type).toBeNull();
    // delete + decrement transaction ran
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('switches type without touching the total counter', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    prisma.reaction.findUnique.mockResolvedValue({ type: 'LIKE' });

    const res = await service.react(1, 1, 'ANGRY' as never);
    expect(res.type).toBe('ANGRY');
    expect(prisma.reaction.update).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled(); // no counter change
  });

  it('rejects reacting to a missing post', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.react(1, 999, 'LIKE' as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent on a concurrent double-tap (P2002 on create is swallowed)', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    prisma.reaction.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }),
    );
    // Must resolve (not 500) — the losing concurrent create is a no-op.
    await expect(service.react(1, 1, 'LIKE' as never)).resolves.toMatchObject({ type: 'LIKE' });
  });

  it('blocks reacting when the users have blocked each other', async () => {
    const { service, prisma, blocks } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    blocks.assertNotBlocked.mockRejectedValue(new ForbiddenException());
    await expect(service.react(1, 1, 'LIKE' as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SocialService.follow block guard', () => {
  it('rejects following when blocked (either direction)', async () => {
    const { service, prisma, blocks } = makeService({});
    prisma.user = { findUnique: vi.fn().mockResolvedValue({ id: 2 }) } as never;
    blocks.assertNotBlocked.mockRejectedValue(new ForbiddenException());
    await expect(service.follow(1, 'bob')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SocialService.toggleBookmark', () => {
  it('adds a bookmark when none exists', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    prisma.bookmark.findUnique.mockResolvedValue(null);
    const res = await service.toggleBookmark(1, 1);
    expect(res).toEqual({ bookmarked: true });
    expect(prisma.bookmark.create).toHaveBeenCalledOnce();
  });

  it('removes an existing bookmark', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, userId: 2 });
    prisma.bookmark.findUnique.mockResolvedValue({ userId: 1, postId: 1 });
    const res = await service.toggleBookmark(1, 1);
    expect(res).toEqual({ bookmarked: false });
    expect(prisma.bookmark.delete).toHaveBeenCalledOnce();
  });
});
