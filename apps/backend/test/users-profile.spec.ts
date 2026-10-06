import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/users/users.service';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    block: { findFirst: vi.fn() },
    follow: { findUnique: vi.fn() },
    post: { count: vi.fn() },
    $queryRaw: vi.fn(),
    ...prismaOverrides,
  };
  const service = new UsersService(prisma as never);
  return { service, prisma };
}

describe('UsersService.findByUsername visibility', () => {
  it('404s a banned user to an outside viewer', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 2,
      bannedAt: new Date(),
      _count: { posts: 0 },
    });
    await expect(service.findByUsername('bob', 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still lets a banned user view their own profile', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 2,
      bannedAt: new Date(),
      _count: { posts: 0 },
    });
    const result = await service.findByUsername('bob', 2);
    expect(result.isSelf).toBe(true);
  });

  it('404s when either side has blocked the other, hiding the profile from the viewer', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 2, bannedAt: null, _count: { posts: 1 } });
    prisma.block.findFirst.mockResolvedValue({ blockerId: 2 });
    await expect(service.findByUsername('bob', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
  });

  it('reports isFollowing for a non-blocked viewer who follows the profile', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 2, bannedAt: null, _count: { posts: 1 } });
    prisma.block.findFirst.mockResolvedValue(null);
    prisma.follow.findUnique.mockResolvedValue({ followerId: 1, followingId: 2 });
    const result = await service.findByUsername('bob', 1);
    expect(result.isFollowing).toBe(true);
    expect(result.isSelf).toBe(false);
  });
});

describe('UsersService.updateProfile', () => {
  it('writes only the provided fields and returns the public+private profile shape', async () => {
    const { service, prisma } = makeService();
    prisma.user.update.mockResolvedValue({ id: 1, displayName: 'New name', email: 'a@b.com' });
    await service.updateProfile(1, { displayName: 'New name' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { displayName: 'New name' },
      select: expect.objectContaining({ email: true, emailVerified: true, affiliateId: true }),
    });
  });
});

describe('UsersService.searchUsers', () => {
  it('excludes banned users via the WHERE clause (parity with findByUsername)', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([]);
    await service.searchUsers('bob');
    const sql = prisma.$queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('banned_at IS NULL');
  });

  it('returns an empty array without querying for a blank search term', async () => {
    const { service, prisma } = makeService();
    const result = await service.searchUsers('   ');
    expect(result).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('UsersService.deleteAccount', () => {
  it('hard-deletes the user row (cascades handle the rest)', async () => {
    const { service, prisma } = makeService();
    prisma.user.delete.mockResolvedValue({});
    const result = await service.deleteAccount(9);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(result).toEqual({ success: true });
  });
});
