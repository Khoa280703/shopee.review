import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';

function make(userRow: unknown) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(userRow),
      update: vi.fn().mockResolvedValue(userRow),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const mail = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(prisma as never, {} as never, {} as never, mail as never);
  return { service, prisma, mail };
}

describe('AuthService.changePassword', () => {
  it('bumps tokenVersion and re-signs the cookie on success', async () => {
    const hash = await bcrypt.hash('oldpass12', 10);
    const { service, prisma } = make({ id: 1, passwordHash: hash, username: 'u', tokenVersion: 3 });
    const setCookie = vi.fn();
    // stub jwt.sign path via the private setAuthCookie → spy on res.cookie
    const res = { cookie: setCookie } as never;
    (service as unknown as { jwt: { sign: () => string } }).jwt = { sign: () => 'signed' };
    (service as unknown as { config: { get: () => string } }).config = { get: () => 'false' };

    await service.changePassword(1, 'oldpass12', 'newpass34', res);

    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.tokenVersion).toEqual({ increment: 1 });
    expect(arg.data.passwordHash).toBeTypeOf('string');
    expect(setCookie).toHaveBeenCalledOnce();
  });

  it('rejects a wrong current password', async () => {
    const hash = await bcrypt.hash('realpass12', 10);
    const { service } = make({ id: 1, passwordHash: hash, username: 'u', tokenVersion: 0 });
    await expect(
      service.changePassword(1, 'wrongpass', 'newpass34', {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthService.verifyEmail expiry', () => {
  it('rejects an expired verify token', async () => {
    const { service } = make({ id: 1, verifyToken: 't', verifyTokenExp: new Date(Date.now() - 1000) });
    await expect(service.verifyEmail('t')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts a valid, unexpired token and clears it', async () => {
    const { service, prisma } = make({
      id: 1,
      verifyToken: 't',
      verifyTokenExp: new Date(Date.now() + 60_000),
    });
    await service.verifyEmail('t');
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.emailVerified).toBe(true);
    expect(arg.data.verifyToken).toBeNull();
  });
});

describe('AuthService.resendVerification', () => {
  it('is a no-op for unknown or already-verified emails (no enumeration)', async () => {
    const unknown = make(null);
    await unknown.service.resendVerification('nope@b.com');
    expect(unknown.mail.sendVerificationEmail).not.toHaveBeenCalled();

    const verified = make({ id: 1, email: 'v@b.com', emailVerified: true });
    await verified.service.resendVerification('v@b.com');
    expect(verified.mail.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('re-sends the existing token without regenerating when still valid', async () => {
    const { service, prisma, mail } = make({
      id: 1,
      email: 'a@b.com',
      emailVerified: false,
      verifyToken: 'existing',
      verifyTokenExp: new Date(Date.now() + 60_000),
    });
    await service.resendVerification('a@b.com');
    expect(prisma.user.update).not.toHaveBeenCalled(); // no regeneration
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', 'existing');
  });

  it('regenerates the token when the current one is expired', async () => {
    const { service, prisma, mail } = make({
      id: 1,
      email: 'a@b.com',
      emailVerified: false,
      verifyToken: 'old',
      verifyTokenExp: new Date(Date.now() - 1000),
    });
    await service.resendVerification('a@b.com');
    expect(prisma.user.update).toHaveBeenCalledOnce();
    expect(mail.sendVerificationEmail).toHaveBeenCalledOnce();
  });
});

describe('AuthService session management', () => {
  function svc(sessionMock: Record<string, unknown>) {
    const prisma = { session: sessionMock };
    return {
      service: new AuthService(prisma as never, {} as never, {} as never, {} as never),
      prisma,
    };
  }

  it('revokeSession scopes the delete to the owner', async () => {
    const { service, prisma } = svc({ deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });
    await service.revokeSession(7, 'sess-a');
    expect((prisma.session as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).toHaveBeenCalledWith({
      where: { id: 'sess-a', userId: 7 },
    });
  });

  it('revokeSession throws when nothing was deleted (not owner / missing)', async () => {
    const { service } = svc({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) });
    await expect(service.revokeSession(7, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokeOtherSessions keeps the current session', async () => {
    const { service, prisma } = svc({ deleteMany: vi.fn().mockResolvedValue({ count: 3 }) });
    await service.revokeOtherSessions(7, 'current-sid');
    expect((prisma.session as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, id: { not: 'current-sid' } },
    });
  });

  it('listSessions flags the caller current session', async () => {
    const rows = [
      { id: 'a', userAgent: null, ip: null, createdAt: new Date() },
      { id: 'b', userAgent: null, ip: null, createdAt: new Date() },
    ];
    const { service } = svc({ findMany: vi.fn().mockResolvedValue(rows) });
    const out = await service.listSessions(7, 'b');
    expect(out.find((s) => s.id === 'b')?.current).toBe(true);
    expect(out.find((s) => s.id === 'a')?.current).toBe(false);
  });
});
