import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Constant-time string compare — avoids leaking the token via response timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guards the Bull Board dashboard. Accepts `Authorization: Bearer <ADMIN_TOKEN>`
 * or HTTP Basic auth (any username, password = ADMIN_TOKEN) for browser access.
 * Passed to BullBoardModule via its `middleware` option so it runs before the
 * board router.
 */
export function bullBoardAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(403).send('ADMIN_TOKEN not configured');
    return;
  }
  const auth = req.headers.authorization ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  let basicPass: string | null = null;
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    basicPass = decoded.split(':')[1] ?? null;
  }
  if ((bearer && safeEqual(bearer, adminToken)) || (basicPass && safeEqual(basicPass, adminToken))) {
    next();
    return;
  }
  res
    .status(401)
    .setHeader('WWW-Authenticate', 'Basic realm="Bull Board"')
    .send('Unauthorized');
}
