import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/current-user.decorator';

function cookieExtractor(req: Request): string | null {
  return req?.cookies?.auth_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: number;
    username: string;
    ver?: number;
  }): Promise<AuthUser> {
    // Single query. Load only what's needed: strip secrets via omit, keep
    // tokenVersion for the revocation check, then remove it before returning.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      omit: {
        passwordHash: true,
        verifyToken: true,
        verifyTokenExp: true,
        resetToken: true,
        resetTokenExp: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    // Revocation: a token whose version doesn't match the user's current
    // tokenVersion is stale (password reset/change or ban). Legacy pre-`ver`
    // tokens are treated as 0 (the global-bump migration set every existing
    // user to 1, so those are already invalidated).
    const { tokenVersion, ...authUser } = user;
    if ((payload.ver ?? 0) !== tokenVersion) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }
    if (authUser.bannedAt) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }
    return authUser;
  }
}
