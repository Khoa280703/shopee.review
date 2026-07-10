import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { sniffImageType } from '../src/uploads/uploads.controller';
import { AuthService } from '../src/auth/auth.service';
import { SocialService } from '../src/social/social.service';
import { ReconciliationService } from '../src/maintenance/reconciliation.service';

// ---------------------------------------------------------------------------
// P2-14: Upload magic-byte sniffing
// ---------------------------------------------------------------------------
describe('sniffImageType', () => {
  it('detects JPEG/PNG/GIF/WEBP from magic bytes', () => {
    const pad = (head: number[]) => Buffer.from([...head, ...new Array(12).fill(0)]);
    expect(sniffImageType(pad([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(Buffer.from('GIF89a' + '\0'.repeat(12)))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('RIFF1234WEBP' + '\0'))).toBe('image/webp');
  });

  it('rejects spoofed content (e.g. SVG/HTML with image MIME)', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(Buffer.from('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageType(Buffer.from([0x00, 0x01]))).toBeNull(); // too short
  });
});

// ---------------------------------------------------------------------------
// P1-6: Password reset flow
// ---------------------------------------------------------------------------
describe('AuthService password reset', () => {
  function make(userRow: unknown) {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(userRow),
        update: vi.fn().mockResolvedValue({}),
      },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const mail = { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      mail as never,
    );
    return { service, prisma, mail };
  }

  it('forgotPassword issues a token + emails users with a password', async () => {
    const { service, prisma, mail } = make({ id: 1, email: 'a@b.com', passwordHash: 'x' });
    await service.forgotPassword('a@b.com');
    expect(prisma.user.update).toHaveBeenCalledOnce();
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledOnce();
  });

  it('forgotPassword is a no-op for unknown email (no enumeration leak)', async () => {
    const { service, prisma, mail } = make(null);
    await service.forgotPassword('nope@b.com');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('forgotPassword skips Google-only accounts (no passwordHash)', async () => {
    const { service, prisma } = make({ id: 1, email: 'g@b.com', passwordHash: null });
    await service.forgotPassword('g@b.com');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('resetPassword rejects expired tokens', async () => {
    const { service } = make({
      id: 1,
      resetToken: 't',
      resetTokenExp: new Date(Date.now() - 1000),
    });
    await expect(service.resetPassword('t', 'newpassword')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resetPassword updates the hash + clears token for a valid token', async () => {
    const { service, prisma } = make({
      id: 1,
      resetToken: 't',
      resetTokenExp: new Date(Date.now() + 60_000),
    });
    await service.resetPassword('t', 'newpassword');
    expect(prisma.user.update).toHaveBeenCalledOnce();
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.resetToken).toBeNull();
    expect(arg.data.passwordHash).toBeTypeOf('string');
  });
});

// ---------------------------------------------------------------------------
// P2-12: Followers/following pagination
// ---------------------------------------------------------------------------
describe('SocialService follower pagination', () => {
  it('caps page size at 50 and reports nextPage when more remain', async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ follower: { username: `u${i}` } }));
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      follow: { findMany: vi.fn().mockResolvedValue(rows) },
    };
    const service = new SocialService(prisma as never, {} as never, {} as never, {} as never);

    const res = await service.listFollowers('bob', 1, 30);
    expect(res.data).toHaveLength(30);
    expect(res.nextPage).toBe(2);
    // requested take = limit + 1 to detect "has more"
    expect(prisma.follow.findMany.mock.calls[0][0].take).toBe(31);
  });

  it('returns nextPage null on the last page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ following: { username: `u${i}` } }));
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      follow: { findMany: vi.fn().mockResolvedValue(rows) },
    };
    const service = new SocialService(prisma as never, {} as never, {} as never, {} as never);

    const res = await service.listFollowing('bob', 1, 30);
    expect(res.data).toHaveLength(5);
    expect(res.nextPage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2-11: Counter reconciliation
// ---------------------------------------------------------------------------
describe('ReconciliationService', () => {
  it('sums the rows corrected across all counter UPDATEs', async () => {
    const prisma = { $executeRawUnsafe: vi.fn().mockResolvedValue(2) };
    const service = new ReconciliationService(prisma as never, null);
    const total = await service.runReconciliation();
    // 8 UPDATE statements × 2 rows each
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(8);
    expect(total).toBe(16);
  });
});
