import { describe, expect, it, vi } from 'vitest';
import { attachViewerPostState } from '../src/common/viewer-post-flags';
import { FeedService } from '../src/feed/feed.service';
import { AdminService } from '../src/moderation/admin.service';

// ---------------------------------------------------------------------------
// attachViewerPostState: the batch fix for FE audit H5 (one reaction-status
// request per post in a list — a 20-post page fired 20 requests). Must stay
// at exactly ONE query each for reaction + bookmark regardless of page size,
// and must never attach anything for an anonymous viewer.
// ---------------------------------------------------------------------------
describe('attachViewerPostState', () => {
  function makePrisma() {
    return {
      reaction: { findMany: vi.fn().mockResolvedValue([{ postId: 2, type: 'LOVE' }]) },
      bookmark: { findMany: vi.fn().mockResolvedValue([{ postId: 1 }]) },
    };
  }

  it('omits viewer fields entirely for an anonymous viewer (no extra queries)', async () => {
    const prisma = makePrisma();
    const posts = [{ id: 1 }, { id: 2 }];
    const result = await attachViewerPostState(prisma as never, undefined, posts);
    expect(result).toBe(posts); // same reference — zero-cost passthrough
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
  });

  it('skips the queries entirely for an empty page', async () => {
    const prisma = makePrisma();
    await attachViewerPostState(prisma as never, 9, []);
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
  });

  it('attaches each post its own viewerReaction/bookmarked in exactly one query per field', async () => {
    const prisma = makePrisma();
    const posts = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = await attachViewerPostState(prisma as never, 9, posts);

    expect(prisma.reaction.findMany).toHaveBeenCalledOnce();
    expect(prisma.bookmark.findMany).toHaveBeenCalledOnce();
    expect(prisma.reaction.findMany).toHaveBeenCalledWith({
      where: { userId: 9, postId: { in: [1, 2, 3] } },
      select: { postId: true, type: true },
    });

    expect(result).toEqual([
      { id: 1, viewerReaction: null, bookmarked: true },
      { id: 2, viewerReaction: 'LOVE', bookmarked: false },
      { id: 3, viewerReaction: null, bookmarked: false },
    ]);
  });
});

describe('FeedService.getFeed attaches viewer reaction/bookmark state (FE audit H5)', () => {
  it('enriches posts fetched fresh from the DB', async () => {
    const prisma = {
      post: { findMany: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
      reaction: { findMany: vi.fn().mockResolvedValue([{ postId: 1, type: 'LIKE' }]) },
      bookmark: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const cache = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) };
    const blocks = { getBlockedUserIds: vi.fn().mockResolvedValue([]) };
    const service = new FeedService(prisma as never, cache as never, blocks as never);

    const result = await service.getFeed(9, undefined, 20);
    expect(result.data).toEqual([
      { id: 1, viewerReaction: 'LIKE', bookmarked: false },
      { id: 2, viewerReaction: null, bookmarked: false },
    ]);
  });

  it('enriches posts served from the cache too (never bakes viewer state into the cached entry)', async () => {
    const cachedFeed = { data: [{ id: 5 }], nextCursor: null };
    const prisma = {
      post: { findMany: vi.fn() },
      reaction: { findMany: vi.fn().mockResolvedValue([{ postId: 5, type: 'WOW' }]) },
      bookmark: { findMany: vi.fn().mockResolvedValue([{ postId: 5 }]) },
    };
    const cache = { get: vi.fn().mockResolvedValue(cachedFeed), set: vi.fn() };
    const blocks = { getBlockedUserIds: vi.fn().mockResolvedValue([]) };
    const service = new FeedService(prisma as never, cache as never, blocks as never);

    const result = await service.getFeed(9, undefined, 20);
    expect(prisma.post.findMany).not.toHaveBeenCalled(); // genuinely served from cache
    expect(result.data).toEqual([{ id: 5, viewerReaction: 'WOW', bookmarked: true }]);
  });
});

// ---------------------------------------------------------------------------
// Admin "Đã xoá" list endpoints (new in this phase) — the only way to find a
// soft-deleted post/comment that isn't already known by id from a report.
// ---------------------------------------------------------------------------
describe('AdminService deleted-content lists', () => {
  function makeService(prismaOverrides: Record<string, unknown>) {
    const prisma = {
      post: { findMany: vi.fn() },
      comment: { findMany: vi.fn() },
      ...prismaOverrides,
    };
    const service = new AdminService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('listDeletedPosts paginates with a nextCursor when more rows exist', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: 3 - i, title: `p${i}` }));
    const { service, prisma } = makeService({});
    prisma.post.findMany.mockResolvedValue(rows);

    const result = await service.listDeletedPosts(2);
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: { not: null } }, take: 3 }),
    );
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).toBe(result.data[1].id);
  });

  it('listDeletedPosts returns nextCursor=null on the last page', async () => {
    const { service, prisma } = makeService({});
    prisma.post.findMany.mockResolvedValue([{ id: 1, title: 'only' }]);
    const result = await service.listDeletedPosts(20);
    expect(result).toEqual({ data: [{ id: 1, title: 'only' }], nextCursor: null });
  });

  it('listDeletedComments queries the comments table with the same soft-delete predicate', async () => {
    const { service, prisma } = makeService({});
    prisma.comment.findMany.mockResolvedValue([]);
    await service.listDeletedComments(20, 5);
    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: { not: null } },
        cursor: { id: 5 },
        skip: 1,
      }),
    );
  });
});
