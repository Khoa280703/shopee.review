import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { PostsService } from '../src/posts/posts.service';
import { SocialService } from '../src/social/social.service';
import { TrackerService } from '../src/tracker/tracker.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { FeedService } from '../src/feed/feed.service';
import { UsersService } from '../src/users/users.service';
import { VISIBLE_POST_WHERE } from '../src/common/visible-content';

function makePostsService(prismaOverrides: Record<string, unknown>) {
  const prisma = {
    post: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    ...prismaOverrides,
  };
  const meili = { enabled: false, indexPost: vi.fn(), deletePost: vi.fn() };
  const service = new PostsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    meili as never,
  );
  return { service, prisma, meili };
}

// ---------------------------------------------------------------------------
// Suspend vs ban visibility matrix: suspension NEVER hides content (only
// locks login, tested in auth.service); a ban hides it via the same
// VISIBLE_POST_WHERE predicate every public read path shares.
// ---------------------------------------------------------------------------
describe('PostsService.findOne visibility', () => {
  it('404s when the post is soft-deleted or its author is banned (DB already filters)', async () => {
    const { service, prisma } = makePostsService({});
    prisma.post.findFirst.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.post.findFirst).toHaveBeenCalledWith({
      where: { id: 1, ...VISIBLE_POST_WHERE },
      include: expect.anything(),
    });
  });

  it('returns the post when visible (author merely suspended, not banned)', async () => {
    const { service, prisma } = makePostsService({});
    const row = { id: 1, user: { bannedAt: null } };
    prisma.post.findFirst.mockResolvedValue(row);
    await expect(service.findOne(1)).resolves.toBe(row);
  });
});

describe('PostsService soft delete + restore', () => {
  it('remove() sets deletedAt/deletedById instead of deleting the row', async () => {
    const { service, prisma } = makePostsService({});
    prisma.post.findUnique.mockResolvedValue({ userId: 5, deletedAt: null });
    await service.remove(5, 1);
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date), deletedById: 5, deleteReason: undefined },
    });
  });

  it('remove() rejects a non-owner and an already-deleted post', async () => {
    const { service, prisma } = makePostsService({});
    prisma.post.findUnique.mockResolvedValue({ userId: 999, deletedAt: null });
    await expect(service.remove(5, 1)).rejects.toBeInstanceOf(ForbiddenException);

    prisma.post.findUnique.mockResolvedValue({ userId: 5, deletedAt: new Date() });
    await expect(service.remove(5, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adminRemovePost() records the moderation reason', async () => {
    const { service, prisma } = makePostsService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, deletedAt: null });
    await service.adminRemovePost(9, 1, 'scam');
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date), deletedById: 9, deleteReason: 'scam' },
    });
  });

  it('restorePost() clears deletedAt/deletedById/deleteReason', async () => {
    const { service, prisma } = makePostsService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, deletedAt: new Date() });
    await service.restorePost(1);
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: null, deletedById: null, deleteReason: null },
    });
  });

  it('restorePost() 404s a post that was never deleted', async () => {
    const { service, prisma } = makePostsService({});
    prisma.post.findUnique.mockResolvedValue({ id: 1, deletedAt: null });
    await expect(service.restorePost(1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Comment soft delete + restore: counters stay consistent (decrement/increment
// by exactly 1 per row, no cascade to replies).
// ---------------------------------------------------------------------------
describe('SocialService comment soft delete + restore', () => {
  // Interactive transaction mock: `softDeleteComment`/`restoreComment` use
  // `$transaction(async (tx) => ...)` (M1, not the array form) so the counter
  // update can be made conditional on whether the updateMany actually matched
  // a row. Running the callback with `prisma` itself as `tx` keeps every
  // assertion below pointed at the same mocked methods.
  function make() {
    const prisma = {
      comment: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      post: { update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const gateway = { emitCommentDeleted: vi.fn() };
    const service = new SocialService(prisma as never, {} as never, gateway as never, {} as never);
    return { service, prisma, gateway };
  }

  it('self-delete decrements commentCount by 1', async () => {
    const { service, prisma, gateway } = make();
    prisma.comment.findUnique.mockResolvedValue({ id: 1, userId: 5, postId: 7, deletedAt: null });
    await service.deleteComment(5, 1);
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 1, deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: 5, deleteReason: undefined },
    });
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { commentCount: { decrement: 1 } },
    });
    expect(gateway.emitCommentDeleted).toHaveBeenCalledWith(7, 1);
  });

  it('a concurrent second delete (race, M1) is a no-op: no double counter decrement', async () => {
    const { service, prisma, gateway } = make();
    prisma.comment.findUnique.mockResolvedValue({ id: 1, userId: 5, postId: 7, deletedAt: null });
    // Both requests passed the initial findUnique check before either
    // committed; the conditional updateMany is what actually arbitrates —
    // simulate the loser by having it match 0 rows (the winner already
    // flipped deletedAt).
    prisma.comment.updateMany.mockResolvedValue({ count: 0 });
    const res = await service.deleteComment(5, 1);
    expect(res).toEqual({ success: true }); // still idempotent from the caller's view
    expect(prisma.post.update).not.toHaveBeenCalled();
    expect(gateway.emitCommentDeleted).not.toHaveBeenCalled();
  });

  it('restoreComment() increments commentCount by 1', async () => {
    const { service, prisma } = make();
    prisma.comment.findUnique.mockResolvedValue({ id: 1, postId: 7, deletedAt: new Date() });
    await service.restoreComment(1);
    expect(prisma.comment.updateMany).toHaveBeenCalledWith({
      where: { id: 1, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, deleteReason: null },
    });
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { commentCount: { increment: 1 } },
    });
  });

  it('a concurrent second restore (race, M1) 404s instead of double-incrementing', async () => {
    const { service, prisma } = make();
    prisma.comment.findUnique.mockResolvedValue({ id: 1, postId: 7, deletedAt: new Date() });
    prisma.comment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.restoreComment(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('restoreComment() 404s a comment that was never deleted', async () => {
    const { service, prisma } = make();
    prisma.comment.findUnique.mockResolvedValue({ id: 1, postId: 7, deletedAt: null });
    await expect(service.restoreComment(1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Deleted parent comment placeholder (M2): a top-level comment with live
// replies stays listed (so the replies aren't orphaned from the thread) but
// its own content is blanked and flagged `isDeleted`.
// ---------------------------------------------------------------------------
describe('SocialService.getComments — deleted-parent-with-replies placeholder', () => {
  function make() {
    const prisma = {
      post: { findUnique: vi.fn().mockResolvedValue({ id: 1, userId: 2, deletedAt: null, user: { bannedAt: null } }) },
      comment: { findMany: vi.fn() },
    };
    const service = new SocialService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('includes a deleted parent that still has a live reply, as a placeholder', async () => {
    const { service, prisma } = make();
    prisma.comment.findMany.mockResolvedValue([
      {
        id: 1,
        postId: 1,
        userId: 9,
        content: 'original removed text',
        deletedAt: new Date(),
        createdAt: new Date(),
        user: { id: 9, username: 'bob' },
        replies: [{ id: 2, content: 'still here', deletedAt: null }],
        _count: { replies: 1 },
      },
    ]);

    const { data } = await service.getComments(1);

    expect(prisma.comment.findMany.mock.calls[0][0].where).toMatchObject({
      postId: 1,
      parentId: null,
      OR: expect.arrayContaining([
        expect.objectContaining({ deletedAt: null }),
        expect.objectContaining({ deletedAt: { not: null } }),
      ]),
    });
    expect(data[0]).toMatchObject({ isDeleted: true, content: '', replyCount: 1 });
    expect(data[0].replies).toHaveLength(1);
  });

  it('a visible (non-deleted) comment is returned as-is, not a placeholder', async () => {
    const { service, prisma } = make();
    prisma.comment.findMany.mockResolvedValue([
      {
        id: 3,
        postId: 1,
        userId: 9,
        content: 'hello',
        deletedAt: null,
        createdAt: new Date(),
        user: { id: 9, username: 'bob' },
        replies: [],
        _count: { replies: 0 },
      },
    ]);
    const { data } = await service.getComments(1);
    expect(data[0]).toMatchObject({ isDeleted: false, content: 'hello' });
  });
});

// ---------------------------------------------------------------------------
// /r/:postId: 404 (no click recorded) for a soft-deleted post or a banned
// author — the affiliate link must stop earning commission once removed.
// ---------------------------------------------------------------------------
describe('TrackerService visibility + click dedup', () => {
  function make(redis: unknown) {
    const prisma = {
      post: { findUnique: vi.fn(), update: vi.fn() },
      clickLog: { findFirst: vi.fn(), create: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const service = new TrackerService(prisma as never, redis as never);
    return { service, prisma };
  }

  it('404s and records no click for a banned author', async () => {
    const { service, prisma } = make(null);
    prisma.post.findUnique.mockResolvedValue({
      id: 1,
      userId: 2,
      affiliateUrl: 'https://s.shopee.vn/x',
      productUrl: 'https://shopee.vn/p',
      deletedAt: null,
      user: { bannedAt: new Date() },
    });
    await expect(service.trackAndResolve(1, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for a soft-deleted post', async () => {
    const { service, prisma } = make(null);
    prisma.post.findUnique.mockResolvedValue({
      id: 1,
      userId: 2,
      affiliateUrl: 'https://s.shopee.vn/x',
      productUrl: 'https://shopee.vn/p',
      deletedAt: new Date(),
      user: { bannedAt: null },
    });
    await expect(service.trackAndResolve(1, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records the click once via an atomic Redis NX claim, skips a repeat within the window', async () => {
    const redis = { set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null) };
    const { service, prisma } = make(redis);
    prisma.post.findUnique.mockResolvedValue({
      id: 1,
      userId: 2,
      affiliateUrl: 'https://s.shopee.vn/x',
      productUrl: 'https://shopee.vn/p',
      deletedAt: null,
      user: { bannedAt: null },
    });

    await service.trackAndResolve(1, { ip: '1.2.3.4' });
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    await service.trackAndResolve(1, { ip: '1.2.3.4' });
    expect(prisma.$transaction).toHaveBeenCalledOnce(); // still once — second click deduped
    expect(redis.set).toHaveBeenCalledWith('click:1:1.2.3.4', '1', { NX: true, EX: 3600 });
  });

  it('falls back to the DB dedup check when Redis is unavailable', async () => {
    const { service, prisma } = make(null);
    prisma.post.findUnique.mockResolvedValue({
      id: 1,
      userId: 2,
      affiliateUrl: 'https://s.shopee.vn/x',
      productUrl: 'https://shopee.vn/p',
      deletedAt: null,
      user: { bannedAt: null },
    });
    prisma.clickLog.findFirst.mockResolvedValue({ id: 99 }); // a recent click exists
    await service.trackAndResolve(1, { ip: '1.2.3.4' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Notification dedup: re-reacting/re-following bumps the existing row instead
// of inserting a new one (spam fix).
// ---------------------------------------------------------------------------
describe('NotificationsService dedup for LIKE/FOLLOW', () => {
  it('upserts via the partial-unique-index raw query for a LIKE notification', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 42n }]),
      notification: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 42n }) },
    };
    const service = new NotificationsService(prisma as never, null as never, undefined);
    const res = await service.create({ recipientId: 1, actorId: 2, type: 'LIKE', postId: 5 });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.notification.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 42n },
      include: expect.anything(),
    });
    expect(res).toEqual({ id: 42n });
  });

  it('upserts via the raw query for a FOLLOW notification too (no postId)', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 7n }]),
      notification: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 7n }) },
    };
    const service = new NotificationsService(prisma as never, null as never, undefined);
    await service.create({ recipientId: 1, actorId: 2, type: 'FOLLOW' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('a plain create (not the dedup path) is used for COMMENT', async () => {
    const prisma = {
      $queryRaw: vi.fn(),
      notification: { create: vi.fn().mockResolvedValue({ id: 1n }) },
    };
    const service = new NotificationsService(prisma as never, null as never, undefined);
    await service.create({ recipientId: 1, actorId: 2, type: 'COMMENT', postId: 5 });
    expect(prisma.notification.create).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('is a no-op for a self-notification regardless of type', async () => {
    const prisma = { $queryRaw: vi.fn(), notification: { create: vi.fn() } };
    const service = new NotificationsService(prisma as never, null as never, undefined);
    expect(await service.create({ recipientId: 1, actorId: 1, type: 'LIKE' })).toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Notification list ordering (M3): sorted by (createdAt, id), not plain id —
// upsertDedupedNotification bumps createdAt on a repeat LIKE/FOLLOW without
// changing the row's id, so an id-only sort left it stuck at its old position.
// ---------------------------------------------------------------------------
describe('NotificationsService.list ordering', () => {
  it('orders by createdAt desc then id desc', async () => {
    const prisma = { notification: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new NotificationsService(prisma as never, null as never, undefined);
    await service.list(1);
    expect(prisma.notification.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Feed / profile-posts visibility: banned authors are excluded (suspended
// authors are NOT — suspend only locks login, tested in auth.service).
// ---------------------------------------------------------------------------
describe('FeedService visibility filter', () => {
  it('excludes soft-deleted posts and banned authors from the personalized feed', async () => {
    const prisma = { post: { findMany: vi.fn().mockResolvedValue([]) } };
    const cache = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
    const blocks = { getBlockedUserIds: vi.fn().mockResolvedValue([]) };
    const service = new FeedService(prisma as never, cache as never, blocks as never);

    await service.getFeed(1);
    const where = prisma.post.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.user.bannedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Login lock: both levels reject login once the password already proved
// ownership (distinct from "wrong credentials").
// ---------------------------------------------------------------------------
describe('AuthService.validateUser — suspend/ban lock login', () => {
  async function makeWith(extra: Record<string, unknown>) {
    const hash = await bcrypt.hash('correct-password', 10);
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, passwordHash: hash, ...extra }) },
    };
    return new AuthService(prisma as never, {} as never, {} as never, {} as never);
  }

  it('rejects a banned account even with the correct password', async () => {
    const service = await makeWith({ bannedAt: new Date() });
    await expect(service.validateUser('user@x.com', 'correct-password')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a suspended account even with the correct password', async () => {
    const service = await makeWith({ suspendedAt: new Date() });
    await expect(service.validateUser('user@x.com', 'correct-password')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows login for an account that is neither suspended nor banned', async () => {
    const service = await makeWith({ bannedAt: null, suspendedAt: null });
    await expect(service.validateUser('user@x.com', 'correct-password')).resolves.not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Profile/account post counts must exclude soft-deleted posts (L1) — a
// self-deleted or moderation-removed post shouldn't still pad the number
// shown on the public profile or the account stats page.
// ---------------------------------------------------------------------------
describe('UsersService post counts exclude soft-deleted (L1)', () => {
  it('findByUsername counts only non-deleted posts', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          bannedAt: null,
          _count: { posts: 3 },
        }),
      },
    };
    const service = new UsersService(prisma as never);
    const result = await service.findByUsername('bob');
    expect(prisma.user.findUnique.mock.calls[0][0].select._count).toEqual({
      select: { posts: { where: { deletedAt: null } } },
    });
    expect(result.totalPosts).toBe(3);
  });

  it('getUserStats counts only non-deleted posts', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ totalClicks: 0, followersCount: 0, followingCount: 0 }) },
      post: { count: vi.fn().mockResolvedValue(2) },
    };
    const service = new UsersService(prisma as never);
    await service.getUserStats(1);
    expect(prisma.post.count).toHaveBeenCalledWith({ where: { userId: 1, deletedAt: null } });
  });
});

describe('UsersService.getUserPosts visibility', () => {
  it('404s entirely for a banned user (parity with the profile page)', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ id: 1, bannedAt: new Date() }) } };
    const service = new UsersService(prisma as never);
    await expect(service.getUserPosts('bob')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excludes soft-deleted posts for a user who is merely suspended (or not moderated at all)', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, bannedAt: null }) },
      post: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new UsersService(prisma as never);
    await service.getUserPosts('bob');
    expect(prisma.post.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});
