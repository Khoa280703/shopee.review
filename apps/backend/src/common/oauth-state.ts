import { type ExecutionContext } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

/** Cookie holding the OAuth CSRF nonce (double-submit against ?state on callback). */
export const OAUTH_STATE_COOKIE = 'oauth_state';

/**
 * Stateless OAuth CSRF protection shared by every provider guard (no
 * express-session). On the INITIATION leg mint a random nonce, store it in an
 * httpOnly cookie, and return it so passport forwards it to the provider as
 * `state`. On the callback leg (?state already present) return {} — don't re-mint.
 */
export function mintOAuthState(context: ExecutionContext): Record<string, unknown> {
  const req = context.switchToHttp().getRequest<Request>();
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

/**
 * Verify the callback ?state matches the nonce cookie (double-submit), then clear
 * the cookie (single use). Returns true only when both are present and equal.
 */
export function verifyOAuthState(req: Request, res: Response): boolean {
  const cookieState = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];
  const queryState = typeof req.query?.state === 'string' ? req.query.state : undefined;
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
  return !!cookieState && !!queryState && cookieState === queryState;
}
