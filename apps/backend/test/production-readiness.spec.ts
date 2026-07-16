import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCookieSecure } from '../src/common/cookie-secure';
import { bullBoardAuth } from '../src/queue/bull-board-auth';
import { FeedService } from '../src/feed/feed.service';
import { UsersService } from '../src/users/users.service';
import { AdminService } from '../src/moderation/admin.service';
import { RetentionService } from '../src/maintenance/retention.service';
import { SocialService } from '../src/social/social.service';
import { AuthService } from '../src/auth/auth.service';

// ---------------------------------------------------------------------------
// Cookie Secure flag is derived from the request scheme (X-Forwarded-Proto)
// ---------------------------------------------------------------------------
describe('resolveCookieSecure', () => {
  afterEach(() => {
    delete process.env.COOKIE_SECURE;
  });

  it('derives from req.secure when no env override', () => {
    expect(resolveCookieSecure({ secure: true })).toBe(true);
    expect(resolveCookieSecure({ secure: false })).toBe(false);
  });

  it('honors an explicit env override in both directions', () => {
    process.env.COOKIE_SECURE = 'true';
    expect(resolveCookieSecure({ secure: false })).toBe(true);
    process.env.COOKIE_SECURE = 'false';
    expect(resolveCookieSecure({ secure: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bull Board auth: constant-time token compare, required token
// ---------------------------------------------------------------------------
describe('bullBoardAuth', () => {
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  function res() {
    const r: Record<string, unknown> = {};
    r.status = vi.fn(() => r);
    r.setHeader = vi.fn(() => r);
    r.send = vi.fn(() => r);
    return r as { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
  }

  it('passes with the correct bearer token', () => {
    process.env.ADMIN_TOKEN = 'sekret';
    const next = vi.fn();
    bullBoardAuth({ headers: { authorization: 'Bearer sekret' } } as never, res() as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a wrong token with 401', () => {
    process.env.ADMIN_TOKEN = 'sekret';
    const r = res();
    const next = vi.fn();
    bullBoardAuth({ headers: { authorization: 'Bearer nope' } } as never, r as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(401);
  });

  it('refuses when ADMIN_TOKEN is unset', () => {
    const r = res();
    const next = vi.fn();
    bullBoardAuth({ headers: {} } as never, r as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });
});

// ---------------------------------------------------------------------------
// Feed degrades to a direct DB read when the cache errors (never 500s)
// ---------------------------------------------------------------------------
describe('FeedService cache degradation', () => {
  it('returns DB results when cache.get throws', async () => {
    const posts = [{ id: 2 }, { id: 1 }];
    const prisma = { post: { findMany: vi.fn().mockResolvedValue(posts) } };
    const cache = {
      get: vi.fn().mockRejectedValue(new Error('redis down')),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const blocks = { getBlockedUserIds: vi.fn().mockResolvedValue([]) };
    const service = new FeedService(prisma as never, cache as never, blocks as never);

    const result = await service.getFeed(1, undefined, 20);
    expect(result.data).toHaveLength(2);
    expect(prisma.post.findMany).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// User search: empty query short-circuits; otherwise runs the raw trigram query
// ---------------------------------------------------------------------------
describe('UsersService.searchUsers', () => {
  it('returns [] for a blank query without hitting the DB', async () => {
    const prisma = { $queryRaw: vi.fn() };
    const service = new UsersService(prisma as never);
    expect(await service.searchUsers('   ')).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('runs the raw query for a real query', async () => {
    const rows = [{ id: 1, username: 'a' }];
    const prisma = { $queryRaw: vi.fn().mockResolvedValue(rows) };
    const service = new UsersService(prisma as never);
    expect(await service.searchUsers('anh')).toBe(rows);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Admin verified grant
// ---------------------------------------------------------------------------
describe('AdminService.setVerified', () => {
  function make(userRow: unknown) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(userRow), update: vi.fn().mockResolvedValue({}) },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new AdminService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('sets verified and writes an audit row', async () => {
    const { service, prisma } = make({ id: 5 });
    const res = await service.setVerified(1, 5, true);
    expect(res).toEqual({ success: true, verified: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { verified: true } });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledOnce();
  });

  it('throws when the target user does not exist', async () => {
    const { service } = make(null);
    await expect(service.setVerified(1, 999, true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Retention deletes aged click_logs in bounded batches
// ---------------------------------------------------------------------------
describe('RetentionService batched click_log delete', () => {
  it('loops $executeRaw until a partial batch is returned', async () => {
    // 10_000, 10_000, 3 -> stops after the short batch. Total 20_003.
    const counts = [10_000, 10_000, 3];
    const prisma = {
      $executeRaw: vi.fn().mockImplementation(() => Promise.resolve(counts.shift() ?? 0)),
      notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new RetentionService(prisma as never, null as never);
    const result = await service.runRetention();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    expect(result.clickLogs).toBe(20_003);
  });
});

// ---------------------------------------------------------------------------
// Comment deletion decrements the counter by the rows actually removed
// ---------------------------------------------------------------------------
describe('SocialService.adminDeleteComment', () => {
  it('decrements commentCount by the number of rows deleted (comment + replies)', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(3), // comment + 2 replies
      post: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      comment: { findUnique: vi.fn().mockResolvedValue({ id: 10, postId: 7 }) },
      $transaction: vi.fn().mockImplementation((cb: (t: unknown) => unknown) => cb(tx)),
    };
    const gateway = { emitCommentDeleted: vi.fn() };
    const service = new SocialService(prisma as never, {} as never, gateway as never, {} as never);

    await service.adminDeleteComment(10);
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { commentCount: { decrement: 3 } },
    });
    expect(gateway.emitCommentDeleted).toHaveBeenCalledWith(7, 10);
  });
});

// ---------------------------------------------------------------------------
// Register uses a generic conflict message (no account enumeration)
// ---------------------------------------------------------------------------
describe('AuthService.register enumeration', () => {
  it('throws a generic conflict that does not reveal which field matched', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 1, email: 'a@b.com' }) } };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never);
    await expect(
      service.register(
        { email: 'a@b.com', username: 'someone', password: 'x', displayName: 'X' } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ message: expect.not.stringContaining('Email đã') });
    await expect(
      service.register(
        { email: 'a@b.com', username: 'someone', password: 'x', displayName: 'X' } as never,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
