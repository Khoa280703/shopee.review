import { type ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

/** Cookie holding the OAuth CSRF nonce (double-submit against ?state on callback). */
export const OAUTH_STATE_COOKIE = 'oauth_state';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  // Stateless OAuth CSRF protection (no express-session): on the INITIATION leg
  // mint a random nonce, store it in an httpOnly cookie, and pass it to Google as
  // `state`. The callback controller compares the returned ?state to the cookie.
  getAuthenticateOptions(context: ExecutionContext): Record<string, unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    // Callback leg already carries ?state — don't mint a new one.
    if (req.query?.state) return {};
    const res = context.switchToHttp().getResponse<Response>();
    const state = randomBytes(16).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    return { state };
  }
}
