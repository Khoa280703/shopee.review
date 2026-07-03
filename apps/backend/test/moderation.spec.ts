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
    };
    const svc = new AdminService(prisma as never, {} as never, {} as never, {} as never);
    return { svc, prisma };
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
});
