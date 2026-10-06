import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CategoriesController } from '../src/categories/categories.controller';
import { CategoriesService } from '../src/categories/categories.service';
import { AdminGuard } from '../src/moderation/admin.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

const GUARDS_METADATA = '__guards__';

function guardsOn(method: Function) {
  return (Reflect.getMetadata(GUARDS_METADATA, method) ?? []) as unknown[];
}

describe('CategoriesController authorization', () => {
  it('requires JwtAuthGuard + AdminGuard on create/update/delete', () => {
    for (const method of [
      CategoriesController.prototype.create,
      CategoriesController.prototype.update,
      CategoriesController.prototype.delete,
    ]) {
      const guards = guardsOn(method);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(AdminGuard);
    }
  });

  it('findAll has no guards (public listing)', () => {
    expect(guardsOn(CategoriesController.prototype.findAll)).toHaveLength(0);
  });
});

describe('AdminGuard', () => {
  function ctx(user: unknown) {
    return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never;
  }

  it('rejects a logged-in user who is not an admin', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctx({ id: 1, isAdmin: false }))).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('allows an admin through', () => {
    const guard = new AdminGuard();
    expect(guard.canActivate(ctx({ id: 1, isAdmin: true }))).toBe(true);
  });
});

describe('CategoriesService field mapping', () => {
  it('create() only forwards the known CreateCategoryDto fields to Prisma', async () => {
    const prisma = { category: { create: (args: unknown) => Promise.resolve(args) } };
    const service = new CategoriesService(prisma as never);

    const malicious = {
      name: 'Phones',
      slug: 'phones',
      icon: 'phone',
      sortOrder: 1,
      // Mass-assignment attempt: Prisma's generated nested-write input accepts
      // these on CategoryUpdateInput; the service must never pass them through.
      posts: { updateMany: { where: {}, data: { affiliateUrl: 'https://evil.example' } } },
      isAdmin: true,
    } as never;

    const result = await (service.create(malicious) as Promise<{ data: Record<string, unknown> }>);
    expect(result.data).toEqual({ name: 'Phones', slug: 'phones', icon: 'phone', sortOrder: 1 });
    expect(result.data.posts).toBeUndefined();
  });

  it('update() only forwards the known UpdateCategoryDto fields to Prisma', async () => {
    const prisma = {
      category: { update: (args: unknown) => Promise.resolve(args) },
    };
    const service = new CategoriesService(prisma as never);

    const malicious = {
      name: 'Renamed',
      posts: {
        update: { where: { id: 1 }, data: { user: { update: { isAdmin: true } } } },
      },
    } as never;

    const result = await (service.update(1, malicious) as Promise<{ data: Record<string, unknown> }>);
    expect(result.data).toEqual({ name: 'Renamed' });
    expect(result.data.posts).toBeUndefined();
  });
});
