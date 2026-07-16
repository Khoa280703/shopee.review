import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@app/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { isReservedUsername } from '../common/reserved-usernames';
import type { AuthUser } from '../common/current-user.decorator';
import { EMAIL_JOB, EMAIL_QUEUE } from '../queue/queue.constants';
import { RegisterDto } from './dto/register.dto';
import { MailService } from './mail.service';
import type { GoogleProfile } from './strategies/google.strategy';
import type { FacebookProfile } from './strategies/facebook.strategy';

const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Device/request info captured at login for the active-sessions list. */
export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
  /** Whether the request arrived over HTTPS — drives the cookie `Secure` flag. */
  secure?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @Optional()
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue?: Queue,
  ) {}

  private async dispatchVerificationEmail(email: string, token: string): Promise<void> {
    if (this.emailQueue) {
      await this.emailQueue.add(EMAIL_JOB.VERIFY, { email, token });
      return;
    }
    // No queue (host dev): send synchronously.
    await this.mail.sendVerificationEmail(email, token);
  }

  private sanitize(user: User): AuthUser {
    // Denylist: strip every internal/secret field. `isAdmin` is intentionally
    // kept (client uses it to gate the /admin UI). Keep this in sync with
    // JwtStrategy's `omit` — any new sensitive User column must be added here.
    const {
      passwordHash: _passwordHash,
      verifyToken: _verifyToken,
      verifyTokenExp: _verifyTokenExp,
      resetToken: _resetToken,
      resetTokenExp: _resetTokenExp,
      tokenVersion: _tokenVersion,
      ...rest
    } = user;
    return rest;
  }

  private async setAuthCookie(
    res: Response,
    user: Pick<User, 'id' | 'username' | 'tokenVersion'>,
    meta?: SessionMeta,
  ): Promise<void> {
    // One session row per login; its id (`sid`) rides in the JWT so a specific
    // device can be revoked by deleting the row (checked in JwtStrategy).
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        userAgent: meta?.userAgent?.slice(0, 400) ?? null,
        ip: meta?.ip ?? null,
      },
      select: { id: true },
    });
    const token = this.jwt.sign({
      sub: user.id,
      username: user.username,
      ver: user.tokenVersion,
      sid: session.id,
    });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: meta?.secure ?? false,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }

  clearAuthCookie(res: Response, meta?: SessionMeta): void {
    res.clearCookie(COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: meta?.secure ?? false,
      sameSite: 'lax',
    });
  }

  /** Log out: revoke THIS session (if any) and clear the cookie. */
  async logout(res: Response, sessionId?: string, meta?: SessionMeta): Promise<void> {
    if (sessionId) {
      await this.prisma.session.deleteMany({ where: { id: sessionId } });
    }
    this.clearAuthCookie(res, meta);
  }

  /** Active sessions for the account, newest first; flags the caller's own. */
  async listSessions(userId: number, currentSessionId?: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  /** Revoke one session — only if it belongs to the caller. */
  async revokeSession(userId: number, sessionId: string): Promise<{ success: boolean }> {
    const result = await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
    if (result.count === 0) {
      throw new NotFoundException('Không tìm thấy phiên đăng nhập');
    }
    return { success: true };
  }

  /** Log out every OTHER device, keeping the caller's current session. */
  async revokeOtherSessions(userId: number, currentSessionId?: string): Promise<{ count: number }> {
    // Defensive: without a known current session we can't tell which to keep, so
    // refuse rather than delete every session (incl. the caller's own).
    if (!currentSessionId) {
      throw new BadRequestException('Không xác định được phiên hiện tại');
    }
    const result = await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    return { count: result.count };
  }

  async register(dto: RegisterDto, res: Response, meta?: SessionMeta): Promise<AuthUser> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email đã được sử dụng' : 'Username đã tồn tại',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verifyToken = randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        emailVerified: false,
        verifyToken,
        verifyTokenExp: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      },
    });

    await this.dispatchVerificationEmail(user.email, verifyToken);
    await this.setAuthCookie(res, user, meta);
    return this.sanitize(user);
  }

  // Returns the FULL user row (not sanitized) so `login` can sign the token
  // version into the cookie; the controller path sanitizes on the way out.
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return null;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: User, res: Response, meta?: SessionMeta): Promise<AuthUser> {
    await this.setAuthCookie(res, user, meta);
    return this.sanitize(user);
  }

  async googleLogin(profile: GoogleProfile, res: Response, meta?: SessionMeta): Promise<AuthUser> {
    if (!profile.email) {
      throw new BadRequestException('Google không trả về email');
    }

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
    });

    if (!user) {
      const username = await this.generateUniqueUsername(profile.email);
      user = await this.prisma.user.create({
        data: {
          username,
          email: profile.email,
          googleId: profile.googleId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          emailVerified: true,
        },
      });
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.googleId, emailVerified: true },
      });
    }

    await this.setAuthCookie(res, user, meta);
    return this.sanitize(user);
  }

  async facebookLogin(profile: FacebookProfile, res: Response, meta?: SessionMeta): Promise<AuthUser> {
    if (!profile.email) {
      // Facebook only returns email if the user granted it; without it we can't
      // create/link a unique account (email is required + unique).
      throw new BadRequestException('Facebook không trả về email — vui lòng cấp quyền email');
    }

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ facebookId: profile.facebookId }, { email: profile.email }] },
    });

    if (!user) {
      const username = await this.generateUniqueUsername(profile.email);
      user = await this.prisma.user.create({
        data: {
          username,
          email: profile.email,
          facebookId: profile.facebookId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          emailVerified: true, // provider-verified identity → trusted, no email link
        },
      });
    } else if (!user.facebookId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { facebookId: profile.facebookId, emailVerified: true },
      });
    }

    await this.setAuthCookie(res, user, meta);
    return this.sanitize(user);
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const base = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 40) || 'user';

    let candidate = isReservedUsername(base) ? `${base}1` : base;
    let attempt = 0;
    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      attempt += 1;
      candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      if (attempt > 10) {
        candidate = `user${randomBytes(4).toString('hex')}`;
        break;
      }
    }
    return candidate;
  }

  /**
   * Issue a password-reset token. Always resolves the same way whether or not
   * the email exists, to avoid leaking which emails are registered.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Google-only accounts (no passwordHash) can't reset a password.
    if (!user || !user.passwordHash) return;

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExp },
    });
    await this.mail.sendPasswordResetEmail(user.email, resetToken);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
      throw new BadRequestException('Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      // Bump tokenVersion → every existing session (incl. a thief's) is revoked.
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
        tokenVersion: { increment: 1 },
      },
    });
    // Drop all session rows too so the active-sessions list reflects reality.
    await this.prisma.session.deleteMany({ where: { userId: user.id } });
  }

  /**
   * Change password for a logged-in user. Requires the current password and
   * bumps tokenVersion so all OTHER sessions are invalidated. Returns a freshly
   * signed cookie so the current session stays logged in.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    res: Response,
    meta?: SessionMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new BadRequestException('Tài khoản không dùng mật khẩu');
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    // Revoke every existing session, then re-issue a fresh one for this device so
    // the user stays logged in here but all other devices are logged out.
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.setAuthCookie(res, updated, meta);
  }

  /**
   * Re-send the verification email. Silent success for unknown/already-verified
   * emails (no enumeration). Does NOT regenerate a still-valid token (prevents an
   * attacker invalidating the victim's existing link); only refreshes if expired.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) return;

    let token = user.verifyToken;
    const expired = !user.verifyTokenExp || user.verifyTokenExp < new Date();
    if (!token || expired) {
      token = randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { verifyToken: token, verifyTokenExp: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) },
      });
    }
    await this.dispatchVerificationEmail(user.email, token);
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { verifyToken: token } });
    if (!user || !user.verifyTokenExp || user.verifyTokenExp < new Date()) {
      throw new NotFoundException('Token xác minh không hợp lệ hoặc đã hết hạn');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
    });
  }
}
