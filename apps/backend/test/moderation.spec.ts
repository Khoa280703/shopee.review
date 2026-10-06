import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma, ReportTargetType } from '@app/database';
import { ReportsService } from '../src/moderation/reports.service';
import { BlocksService } from '../src/moderation/blocks.service';
import { AdminService } from '../src/moderation/admin.service';

describe('ReportsService', () => {
  it('persists a report when the target exists', async () => {
    const prisma = {
      post: { findUnique: vi.fn().mockResolvedValue({ id: 5 }) },
      report: { create: vi.fn().mockResolvedValue({}) },
    };
    const svc = new ReportsService(prisma as never);
    const res = await svc.create(1, { targetType: ReportTargetType.POST, targetId: 5, reason: 'SPAM' as never });
    expect(res).toEqual({ success: true });
    expect(prisma.report.create).toHaveBeenCalledOnce();
  });

  it('returns success without persisting when the target does not exist (no enumeration)', async () => {
    const prisma = {
      post: { findUnique: vi.fn().mockResolvedValue(null) },
      report: { create: vi.fn() },
    };
    const svc = new ReportsService(prisma as never);
    const res = await svc.create(1, { targetType: ReportTargetType.POST, targetId: 999, reason: 'SPAM' as never });
    expect(res).toEqual({ success: true });
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('is idempotent on duplicate report (P2002 swallowed)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' });
    const prisma = {
      post: { findUnique: vi.fn().mockResolvedValue({ id: 5 }) },
      report: { create: vi.fn().mockRejectedValue(p2002) },
    };
    const svc = new ReportsService(prisma as never);
    await expect(
      svc.create(1, { targetType: ReportTargetType.POST, targetId: 5, reason: 'SPAM' as never }),
    ).resolves.toEqual({ success: true });
  });
});

describe('BlocksService.isBlockedEitherWay', () => {
  it('detects a block in either direction', async () => {
    const prisma = { block: { findFirst: vi.fn().mockResolvedValue({ blockerId: 2 }) } };
    const svc = new BlocksService(prisma as never);
    expect(await svc.isBlockedEitherWay(1, 2)).toBe(true);
  });

  it('returns false for self', async () => {
    const prisma = { block: { findFirst: vi.fn() } };
    const svc = new BlocksService(prisma as never);
    expect(await svc.isBlockedEitherWay(1, 1)).toBe(false);
    expect(prisma.block.findFirst).not.toHaveBeenCalled();
  });

  it('collapses blocked ids from both directions', async () => {
    const prisma = {
      block: {
        findMany: vi.fn().mockResolvedValue([
          { blockerId: 1, blockedId: 2 },
          { blockerId: 3, blockedId: 1 },
        ]),
      },
    };
    const svc = new BlocksService(prisma as never);
    expect((await svc.getBlockedUserIds(1)).sort()).toEqual([2, 3]);
  });
});

describe('AdminService.ban', () => {
  function make(target: unknown) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue({}) },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      post: { findMany: vi.fn().mockResolvedValue([]) },
      report: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const meili = { deletePosts: vi.fn(), reindexPosts: vi.fn() };
    const reports = { autoResolve: vi.fn().mockResolvedValue(undefined) };
    const svc = new AdminService(prisma as never, {} as never, {} as never, reports as never, meili as never);
    return { svc, prisma, meili, reports };
  }

  it('rejects banning yourself', async () => {
    const { svc } = make({ id: 1, isAdmin: false });
    await expect(svc.ban(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects banning another admin', async () => {
    const { svc } = make({ id: 2, isAdmin: true });
    await expect(svc.ban(1, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets bannedAt and bumps tokenVersion on a normal user', async () => {
    const { svc, prisma } = make({ id: 2, isAdmin: false });
    await svc.ban(1, 2);
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.bannedAt).toBeInstanceOf(Date);
    expect(arg.data.tokenVersion).toEqual({ increment: 1 });
  });

  it('kills sessions and auto-resolves pending reports against the user', async () => {
    const { svc, prisma, reports } = make({ id: 2, isAdmin: false });
    await svc.ban(1, 2);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 2 } });
    expect(reports.autoResolve).toHaveBeenCalledWith('USER', 2, 1);
  });

  it('removes the banned user posts from the search index', async () => {
    const { svc, prisma, meili } = make({ id: 2, isAdmin: false });
    prisma.post.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    await svc.ban(1, 2);
    expect(meili.deletePosts).toHaveBeenCalledWith([10, 11]);
  });
});

describe('AdminService.unban', () => {
  function make(target: unknown) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue({}) },
      post: { findMany: vi.fn().mockResolvedValue([{ id: 10 }]) },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const meili = { deletePosts: vi.fn(), reindexPosts: vi.fn() };
    const svc = new AdminService(prisma as never, {} as never, {} as never, {} as never, meili as never);
    return { svc, prisma, meili };
  }

  it('clears bannedAt and re-adds the user posts to the search index', async () => {
    const { svc, prisma, meili } = make({ id: 2 });
    await svc.unban(1, 2);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { bannedAt: null } });
    expect(meili.reindexPosts).toHaveBeenCalledWith([10]);
  });

  it('404s on an unknown user', async () => {
    const { svc } = make(null);
    await expect(svc.unban(1, 999)).rejects.toThrow();
  });
});

describe('AdminService.suspend', () => {
  function make(target: unknown) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(target), update: vi.fn().mockResolvedValue({}) },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      report: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const reports = { autoResolve: vi.fn().mockResolvedValue(undefined) };
    const svc = new AdminService(prisma as never, {} as never, {} as never, reports as never, {} as never);
    return { svc, prisma };
  }

  it('rejects suspending yourself or another admin', async () => {
    const self = make({ id: 1, isAdmin: false });
    await expect(self.svc.suspend(1, 1)).rejects.toBeInstanceOf(BadRequestException);
    const admin = make({ id: 2, isAdmin: true });
    await expect(admin.svc.suspend(1, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets suspendedAt + bumps tokenVersion + kills sessions, but never touches bannedAt', async () => {
    const { svc, prisma } = make({ id: 2, isAdmin: false });
    await svc.suspend(1, 2);
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.suspendedAt).toBeInstanceOf(Date);
    expect(arg.data.tokenVersion).toEqual({ increment: 1 });
    expect(arg.data.bannedAt).toBeUndefined();
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 2 } });
  });

  it('unsuspend clears suspendedAt without touching content visibility state', async () => {
    const { svc, prisma } = make({ id: 2 });
    await svc.unsuspend(1, 2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { suspendedAt: null },
    });
  });
});

// ---------------------------------------------------------------------------
// "Tài khoản bị khoá" admin tab (M4): the only way to find a suspended/banned
// user again without already knowing their id from the report that led there.
// ---------------------------------------------------------------------------
describe('AdminService.listLockedUsers', () => {
  it('queries users with suspendedAt or bannedAt set, newest first', async () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } };
    const svc = new AdminService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    await svc.listLockedUsers();
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({
      where: { OR: [{ suspendedAt: { not: null } }, { bannedAt: { not: null } }] },
      orderBy: { id: 'desc' },
    });
  });
});
