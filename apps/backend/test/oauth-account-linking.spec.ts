import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';

function make(existingUser: unknown) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(existingUser),
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data })),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...(existingUser as Record<string, unknown>), ...data }),
      ),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue('signed-token') };
  const config = { get: vi.fn().mockReturnValue(undefined) };
  const mail = { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() };
  const service = new AuthService(prisma as never, jwt as never, config as never, mail as never);
  const res = { cookie: vi.fn() } as never;
  return { service, prisma, res };
}

describe('AuthService.googleLogin — linking to an existing account', () => {
  it('clears the password and kills every session when the matched account was never verified', async () => {
    const existing = {
      id: 5,
      email: 'victim@gmail.com',
      googleId: null,
      passwordHash: await bcrypt.hash('attacker-chosen-password', 10),
      emailVerified: false,
      tokenVersion: 0,
    };
    const { service, prisma, res } = make(existing);

    await service.googleLogin(
      { googleId: 'g-1', email: 'victim@gmail.com', displayName: 'Victim', emailVerified: true },
      res,
    );

    expect(prisma.user.update).toHaveBeenCalledOnce();
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.googleId).toBe('g-1');
    expect(data.emailVerified).toBe(true);
    expect(data.passwordHash).toBeNull();
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 5 } });
  });

  it('does not touch the password or sessions when the matched account was already verified', async () => {
    const existing = {
      id: 6,
      email: 'real@gmail.com',
      googleId: null,
      passwordHash: 'some-hash',
      emailVerified: true,
      tokenVersion: 0,
    };
    const { service, prisma, res } = make(existing);

    await service.googleLogin(
      { googleId: 'g-2', email: 'real@gmail.com', displayName: 'Real', emailVerified: true },
      res,
    );

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toBeUndefined();
    expect(data.tokenVersion).toBeUndefined();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to link when Google reports the email as unverified', async () => {
    const existing = {
      id: 7,
      email: 'victim2@gmail.com',
      googleId: null,
      passwordHash: 'attacker-hash',
      emailVerified: false,
      tokenVersion: 0,
    };
    const { service, prisma, res } = make(existing);

    await expect(
      service.googleLogin(
        { googleId: 'g-3', email: 'victim2@gmail.com', displayName: 'Victim', emailVerified: false },
        res,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe('AuthService.facebookLogin — linking to an existing account', () => {
  it('clears the password and kills every session when the matched account was never verified', async () => {
    const existing = {
      id: 8,
      email: 'victim@fb.com',
      facebookId: null,
      passwordHash: 'attacker-hash',
      emailVerified: false,
      tokenVersion: 0,
    };
    const { service, prisma, res } = make(existing);

    await service.facebookLogin(
      { facebookId: 'fb-1', email: 'victim@fb.com', displayName: 'Victim' },
      res,
    );

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toBeNull();
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 8 } });
  });
});

describe('AuthService.validateUser — unverified-email login stays allowed', () => {
  it('returns the user even when emailVerified is false (product decision: login allowed)', async () => {
    const hash = await bcrypt.hash('somepassword', 10);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, passwordHash: hash, emailVerified: false }),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never);
    const user = await service.validateUser('user@x.com', 'somepassword');
    expect(user).not.toBeNull();
    expect(user?.emailVerified).toBe(false);
  });
});
