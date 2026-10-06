import { describe, expect, it, vi } from 'vitest';
import { normalizeEmail } from '../src/common/normalize-email';
import { AuthService } from '../src/auth/auth.service';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('is a no-op for an already-normalized email', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });
});

describe('AuthService email lookups are case/whitespace-insensitive', () => {
  function makePrisma(userRow: unknown = null) {
    return {
      user: {
        findFirst: vi.fn().mockResolvedValue(userRow),
        findUnique: vi.fn().mockResolvedValue(userRow),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
        update: vi.fn().mockResolvedValue({}),
      },
      session: { create: vi.fn().mockResolvedValue({ id: 's1' }) },
    };
  }

  it('register() normalizes the email before the duplicate check and the write', async () => {
    const prisma = makePrisma(null);
    const mail = { sendVerificationEmail: vi.fn() };
    const service = new AuthService(
      prisma as never,
      { sign: vi.fn().mockReturnValue('t') } as never,
      {} as never,
      mail as never,
    );
    const res = { cookie: vi.fn() } as never;

    await service.register(
      { username: 'bob', email: '  Bob@Example.COM ', password: 'password1', displayName: 'Bob' },
      res,
    );

    expect(prisma.user.findFirst.mock.calls[0][0].where.OR[0]).toEqual({ email: 'bob@example.com' });
    expect(prisma.user.create.mock.calls[0][0].data.email).toBe('bob@example.com');
  });

  it('validateUser() normalizes the email before the lookup (covers the login path)', async () => {
    const prisma = makePrisma(null);
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never);

    await service.validateUser(' Bob@Example.COM ', 'password1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'bob@example.com' } });
  });

  it('forgotPassword() normalizes the email before the lookup', async () => {
    const prisma = makePrisma(null);
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never);

    await service.forgotPassword(' Bob@Example.COM ');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'bob@example.com' } });
  });

  it('resendVerification() normalizes the email before the lookup', async () => {
    const prisma = makePrisma(null);
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never);

    await service.resendVerification(' Bob@Example.COM ');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'bob@example.com' } });
  });

  it('googleLogin() normalizes the profile email before lookup and create', async () => {
    const prisma = makePrisma(null);
    const service = new AuthService(
      prisma as never,
      { sign: vi.fn().mockReturnValue('t') } as never,
      {} as never,
      {} as never,
    );
    const res = { cookie: vi.fn() } as never;

    await service.googleLogin(
      { googleId: 'g-1', email: ' Bob@Example.COM ', displayName: 'Bob', emailVerified: true },
      res,
    );

    expect(prisma.user.findFirst.mock.calls[0][0].where.OR[1]).toEqual({ email: 'bob@example.com' });
    expect(prisma.user.create.mock.calls[0][0].data.email).toBe('bob@example.com');
  });
});
