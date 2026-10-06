import { describe, expect, it, vi } from 'vitest';
import { SearchService } from '../src/search/search.service';
import { MeilisearchService } from '../src/search/meilisearch.service';
import { VISIBLE_POST_WHERE } from '../src/common/visible-content';

function makeSearchService(overrides: {
  prisma?: Record<string, unknown>;
  users?: Record<string, unknown>;
  meili?: Record<string, unknown>;
} = {}) {
  const prisma = { post: { findMany: vi.fn() }, $queryRaw: vi.fn(), ...overrides.prisma };
  const users = { searchUsers: vi.fn().mockResolvedValue([]), ...overrides.users };
  const meili = { enabled: false, ...overrides.meili };
  const service = new SearchService(prisma as never, users as never, meili as never);
  return { service, prisma, users, meili };
}

describe('SearchService.search', () => {
  it('returns empty results for a blank query without touching Meili/Postgres', async () => {
    const { service, prisma, users } = makeSearchService();
    const result = await service.search('   ', 'all');
    expect(result).toEqual({ posts: [], users: [], meta: { page: 1, limit: 20 } });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(users.searchUsers).not.toHaveBeenCalled();
  });

  it('uses Meilisearch hits, then re-filters them through the visible-content WHERE as the authoritative backstop', async () => {
    const meili = {
      enabled: true,
      searchPosts: vi.fn().mockResolvedValue([3, 1, 2]),
    };
    const { service, prisma } = makeSearchService({ meili });
    prisma.post.findMany.mockResolvedValue([
      { id: 1, title: 'one' },
      { id: 2, title: 'two' },
      // id 3 omitted: Postgres-side filter (ban/soft-delete) dropped it even
      // though Meili's index still had it.
    ]);

    const result = await service.search('shoes', 'posts');
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      where: { id: { in: [3, 1, 2] }, ...VISIBLE_POST_WHERE },
      include: expect.anything(),
    });
    // Order follows Meili relevance (1, 2), not the DB fetch order; the
    // stale/invisible id (3) is silently dropped rather than erroring.
    expect(result.posts.map((p) => p.id)).toEqual([1, 2]);
  });

  it('falls back to Postgres full-text search when Meilisearch throws', async () => {
    const meili = {
      enabled: true,
      searchPosts: vi.fn().mockRejectedValue(new Error('meili down')),
    };
    const { service, prisma } = makeSearchService({ meili });
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.search('shoes', 'posts');
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(result.posts).toEqual([]);
  });

  it('falls back to Postgres FTS outright when Meilisearch is disabled', async () => {
    const { service, prisma } = makeSearchService();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 5,
        title: 't',
        content: null,
        images: [],
        affiliate_url: 'https://shopee.vn/a',
        product_url: 'https://shopee.vn/b',
        product_meta: null,
        like_count: 1,
        comment_count: 0,
        click_count: 0,
        created_at: new Date(),
        username: 'bob',
        display_name: 'Bob',
        avatar_url: null,
        verified: false,
      },
    ]);
    const result = await service.search('shoes', 'posts');
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({ id: 5, user: { username: 'bob' } });
  });

  it('searches users via UsersService (which itself excludes banned accounts)', async () => {
    const users = { searchUsers: vi.fn().mockResolvedValue([{ id: 1, username: 'bob' }]) };
    const { service } = makeSearchService({ users });
    const result = await service.search('bob', 'users');
    expect(users.searchUsers).toHaveBeenCalledWith('bob');
    expect(result.posts).toEqual([]);
    expect(result.users).toHaveLength(1);
  });
});

describe('MeilisearchService — skips soft-deleted/banned content (L2)', () => {
  function makeMeili(postRow: Record<string, unknown> | null) {
    const prisma = { post: { findUnique: vi.fn().mockResolvedValue(postRow) } };
    const service = new MeilisearchService(prisma as never);
    const index = { addDocuments: vi.fn(), deleteDocument: vi.fn() };
    // The real Meilisearch client is only constructed when MEILI_HOST is set;
    // inject a fake one shaped just enough for the private `index` getter
    // (`this.client.index(POSTS_INDEX)`) to hand back our spy-able index.
    Object.assign(service, { client: { index: () => index } });
    return { service, prisma, index };
  }

  it('deletes (never (re-)adds) a soft-deleted post from the index', async () => {
    const { service, index } = makeMeili({
      id: 1,
      deletedAt: new Date(),
      user: { username: 'bob', bannedAt: null },
    });
    await service.indexPost(1);
    expect(index.deleteDocument).toHaveBeenCalledWith(1);
    expect(index.addDocuments).not.toHaveBeenCalled();
  });

  it('deletes a visible post whose author is banned', async () => {
    const { service, index } = makeMeili({
      id: 2,
      deletedAt: null,
      user: { username: 'bob', bannedAt: new Date() },
    });
    await service.indexPost(2);
    expect(index.deleteDocument).toHaveBeenCalledWith(2);
    expect(index.addDocuments).not.toHaveBeenCalled();
  });

  it('indexes a normal visible post', async () => {
    const { service, index } = makeMeili({
      id: 3,
      title: 't',
      content: null,
      categoryId: null,
      productUrl: null,
      likeCount: 0,
      createdAt: new Date(),
      deletedAt: null,
      user: { username: 'bob', bannedAt: null },
    });
    await service.indexPost(3);
    expect(index.addDocuments).toHaveBeenCalledOnce();
    expect(index.deleteDocument).not.toHaveBeenCalled();
  });

  it('is a no-op when the post no longer exists', async () => {
    const { service, index } = makeMeili(null);
    await service.indexPost(999);
    expect(index.addDocuments).not.toHaveBeenCalled();
    expect(index.deleteDocument).not.toHaveBeenCalled();
  });
});
