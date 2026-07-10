import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { GoogleAuthGuard, OAUTH_STATE_COOKIE } from './guards/google-auth.guard';
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
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const user = await this.authService.register(dto, res);
    return { user };
  }

  @Post('login')
  @UseGuards(ThrottlerGuard, LocalAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  login(
    @Body() _dto: LoginDto,
    // LocalStrategy puts the full user row on the request; login() signs the
    // cookie (needs tokenVersion) and returns the sanitized shape.
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): { user: AuthUser } {
    return { user: this.authService.login(user, res) };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { success: boolean } {
    this.authService.clearAuthCookie(res);
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
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      res,
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
    // set at initiation. Blocks login-CSRF / account fixation. Clear the nonce
    // either way (single use).
    const cookieState = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];
    const queryState = typeof req.query?.state === 'string' ? req.query.state : undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
    if (!cookieState || !queryState || cookieState !== queryState) {
      res.redirect(`${frontendUrl}/auth/login?error=oauth_state`);
      return;
    }

    await this.authService.googleLogin(req.user as GoogleProfile, res);
    res.redirect(`${frontendUrl}/auth/callback`);
  }
}
