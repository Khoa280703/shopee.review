import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PostsService } from '../src/posts/posts.service';
import type { AuthUser } from '../src/common/current-user.decorator';

const PRODUCT_URL = 'https://shopee.vn/mon-hang-i.111.222';
const AFFILIATE_URL = 'https://shopee.vn/mon-hang-i.111.222?af=1';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    post: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    ...prismaOverrides,
  };
  const notifications = { fanoutNewPost: vi.fn() };
  const meili = { enabled: false, indexPost: vi.fn(), deletePost: vi.fn() };
  const service = new PostsService(
    prisma as never,
    {} as never,
    {} as never,
    notifications as never,
    meili as never,
  );
  return { service, prisma, notifications, meili };
}

function verifiedUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 5, username: 'alice', emailVerified: true, ...overrides } as unknown as AuthUser;
}

describe('PostsService.create', () => {
  it('rejects when the author has not verified their email', async () => {
    const { service } = makeService();
    const user = verifiedUser({ emailVerified: false });
    await expect(
      service.create(user, {
        title: 't',
        productUrl: PRODUCT_URL,
        affiliateUrl: AFFILIATE_URL,
        images: [],
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a non-Shopee product URL before touching the database', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.create(verifiedUser(), {
        title: 't',
        productUrl: 'https://evil.example/product',
        affiliateUrl: AFFILIATE_URL,
        images: [],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects a non-Shopee affiliate URL before touching the database', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.create(verifiedUser(), {
        title: 't',
        productUrl: PRODUCT_URL,
        affiliateUrl: 'https://evil.example/aff',
        images: [],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('creates the post and fans out a new-post notification to followers', async () => {
    const { service, prisma, notifications } = makeService();
    const created = { id: 77, userId: 5 };
    prisma.post.create.mockResolvedValue(created);
    const user = verifiedUser();

    const result = await service.create(user, {
      title: 'Great deal',
      productUrl: PRODUCT_URL,
      affiliateUrl: AFFILIATE_URL,
      images: ['https://cdn.example/a.jpg'],
      categoryId: 3,
    } as never);

    expect(prisma.post.create.mock.calls[0][0].data).toMatchObject({
      userId: 5,
      title: 'Great deal',
      productUrl: PRODUCT_URL,
      affiliateUrl: AFFILIATE_URL,
      categoryId: 3,
    });
    expect(notifications.fanoutNewPost).toHaveBeenCalledWith(5, 77);
    expect(result).toBe(created);
  });
});

describe('PostsService.update', () => {
  it('rejects editing a post owned by someone else', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ userId: 999, deletedAt: null });
    await expect(service.update(5, 1, { title: 'x' } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('404s when the post was already soft-deleted', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ userId: 5, deletedAt: new Date() });
    await expect(service.update(5, 1, { title: 'x' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('re-validates a changed productUrl/affiliateUrl before writing', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ userId: 5, deletedAt: null });
    await expect(
      service.update(5, 1, { productUrl: 'https://evil.example/x' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('updates an owned post with valid data', async () => {
    const { service, prisma } = makeService();
    prisma.post.findUnique.mockResolvedValue({ userId: 5, deletedAt: null });
    const updated = { id: 1, title: 'New title' };
    prisma.post.update.mockResolvedValue(updated);

    const result = await service.update(5, 1, { title: 'New title' } as never);
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ title: 'New title' }),
      include: expect.anything(),
    });
    expect(result).toBe(updated);
  });
});
