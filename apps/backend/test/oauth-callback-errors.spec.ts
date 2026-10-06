import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';

/**
 * M5 — a login error from googleLogin/facebookLogin must redirect back to the
 * login page with a readable `?error=` code, not reach Nest's default
 * exception filter (which rendered raw JSON mid-OAuth-redirect).
 */
function makeController(loginImpl: () => Promise<unknown>) {
  const authService = {
    googleLogin: vi.fn(loginImpl),
    facebookLogin: vi.fn(loginImpl),
  };
  const config = { get: vi.fn().mockReturnValue('https://shopee.review') };
  const controller = new AuthController(authService as never, config as never);
  return { controller, authService };
}

function makeReqRes() {
  const req = {
    query: { state: 'abc' },
    cookies: { oauth_state: 'abc' },
    headers: {},
    ip: '1.2.3.4',
    user: {},
  };
  const res = { redirect: vi.fn(), clearCookie: vi.fn(), cookie: vi.fn() };
  return { req, res };
}

describe('AuthController OAuth callback error redirects (M5)', () => {
  it('redirects with error=account_locked for a ForbiddenException (banned/suspended)', async () => {
    const { controller } = makeController(() => {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    });
    const { req, res } = makeReqRes();
    await controller.googleCallback(req as never, res as never);
    expect(res.redirect).toHaveBeenCalledWith('https://shopee.review/auth/login?error=account_locked');
  });

  it('redirects with error=oauth_unverified for a BadRequestException (unverified-email link refused)', async () => {
    const { controller } = makeController(() => {
      throw new BadRequestException('Email Google chưa được xác minh');
    });
    const { req, res } = makeReqRes();
    await controller.facebookCallback(req as never, res as never);
    expect(res.redirect).toHaveBeenCalledWith('https://shopee.review/auth/login?error=oauth_unverified');
  });

  it('redirects with error=oauth_failed for any other error', async () => {
    const { controller } = makeController(() => {
      throw new Error('boom');
    });
    const { req, res } = makeReqRes();
    await controller.googleCallback(req as never, res as never);
    expect(res.redirect).toHaveBeenCalledWith('https://shopee.review/auth/login?error=oauth_failed');
  });

  it('redirects to /auth/callback on success (no error param)', async () => {
    const { controller } = makeController(() => Promise.resolve({ id: 1 }));
    const { req, res } = makeReqRes();
    await controller.googleCallback(req as never, res as never);
    expect(res.redirect).toHaveBeenCalledWith('https://shopee.review/auth/callback');
  });
});
