import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@app/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { isReservedUsername } from '../common/reserved-usernames';
import type { AuthUser } from '../common/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { MailService } from './mail.service';
import type { GoogleProfile } from './strategies/google.strategy';

const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private sanitize(user: User): AuthUser {
    const { passwordHash: _passwordHash, verifyToken: _verifyToken, ...rest } = user;
    return rest;
  }

  private setAuthCookie(res: Response, user: Pick<User, 'id' | 'username'>): void {
    const token = this.jwt.sign({ sub: user.id, username: user.username });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }

  clearAuthCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  async register(dto: RegisterDto, res: Response): Promise<AuthUser> {
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
      },
    });

    await this.mail.sendVerificationEmail(user.email, verifyToken);
    this.setAuthCookie(res, user);
    return this.sanitize(user);
  }

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return null;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? this.sanitize(user) : null;
  }

  login(user: AuthUser, res: Response): AuthUser {
    this.setAuthCookie(res, user);
    return user;
  }

  async googleLogin(profile: GoogleProfile, res: Response): Promise<AuthUser> {
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

    this.setAuthCookie(res, user);
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

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { verifyToken: token } });
    if (!user) {
      throw new NotFoundException('Token xác minh không hợp lệ hoặc đã hết hạn');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    });
  }
}
