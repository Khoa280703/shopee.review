import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { User } from '@app/database';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { parseAllowedOrigins } from '../common/shopee-url';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { verifyOAuthState } from '../common/oauth-state';
import { resolveCookieSecure } from '../common/cookie-secure';
import type { FacebookProfile } from './strategies/facebook.strategy';
import type { SessionMeta } from './auth.service';

function sessionMeta(req: Request): SessionMeta {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
    secure: resolveCookieSecure(req),
  };
}
import type { GoogleProfile } from './strategies/google.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async register(
    @Req() req: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const user = await this.authService.register(dto, res, sessionMeta(req));
    return { user };
  }

  @Post('login')
  @UseGuards(ThrottlerGuard, LocalAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  async login(
    @Req() req: Request,
    @Body() _dto: LoginDto,
    // LocalStrategy puts the full user row on the request; login() signs the
    // cookie (needs tokenVersion) and returns the sanitized shape.
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    return { user: await this.authService.login(user, res, sessionMeta(req)) };
  }

  // Optional guard: a valid token lets us revoke its session row; an expired /
  // missing token still clears the cookie (logout must never fail).
  @Post('logout')
  @UseGuards(OptionalJwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.authService.logout(res, user?.sessionId, sessionMeta(req));
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ success: boolean }> {
    await this.authService.forgotPassword(dto.email);
    // Always success to avoid leaking which emails are registered.
    return { success: true };
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: boolean }> {
    await this.authService.resetPassword(dto.token, dto.password);
    return { success: true };
  }

  @Get('verify')
  async verify(@Query('token') token: string): Promise<{ success: boolean }> {
    if (!token) {
      throw new BadRequestException('Thiếu token');
    }
    await this.authService.verifyEmail(token);
    return { success: true };
  }

  @Post('resend-verification')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 15 * 60 * 1000 } })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ success: boolean }> {
    await this.authService.resendVerification(dto.email);
    // Always success — no enumeration of registered/verified emails.
    return { success: true };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async changePassword(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      res,
      sessionMeta(req),
    );
    return { success: true };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth(): void {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // FRONTEND_URL may be a comma-separated list (CORS allow-list); redirect to
    // the first origin so a multi-origin config doesn't produce a broken URL.
    const [frontendUrl] = parseAllowedOrigins(this.config.get<string>('FRONTEND_URL'));

    // OAuth CSRF check: the ?state returned by Google must match the nonce cookie
    // set at initiation. Blocks login-CSRF / account fixation.
    if (!verifyOAuthState(req, res)) {
      res.redirect(`${frontendUrl}/auth/login?error=oauth_state`);
      return;
    }

    await this.authService.googleLogin(req.user as GoogleProfile, res, sessionMeta(req));
    res.redirect(`${frontendUrl}/auth/callback`);
  }

  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookAuth(): void {
    // Passport redirects to Facebook
  }

  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  async facebookCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const [frontendUrl] = parseAllowedOrigins(this.config.get<string>('FRONTEND_URL'));
    if (!verifyOAuthState(req, res)) {
      res.redirect(`${frontendUrl}/auth/login?error=oauth_state`);
      return;
    }
    await this.authService.facebookLogin(req.user as FacebookProfile, res, sessionMeta(req));
    res.redirect(`${frontendUrl}/auth/callback`);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  // "/others" before "/:id" so it isn't captured as an id param.
  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard)
  revokeOtherSessions(@CurrentUser() user: AuthUser) {
    return this.authService.revokeOtherSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.id, id);
  }
}
