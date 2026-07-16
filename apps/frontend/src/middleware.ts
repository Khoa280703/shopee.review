import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED = ['/create', '/feed', '/dashboard', '/settings', '/notifications', '/admin', '/saved'];

// JWT_SECRET is server-only (NOT NEXT_PUBLIC). Must match the backend's secret
// so the middleware can validate the same HS256 token set by AuthService.
const secret = process.env.JWT_SECRET
  ? new TextEncoder().encode(process.env.JWT_SECRET)
  : null;

if (!secret) {
  // Fail-closed (below) rather than trusting cookie presence. Compose refuses to
  // boot without JWT_SECRET, so this should never fire in a real deployment.
  console.warn('[middleware] JWT_SECRET is not set — protected routes will redirect to login.');
}

async function isValidToken(token: string): Promise<boolean> {
  if (!secret) {
    // No secret at the edge → cannot verify → FAIL CLOSED (do not trust a cookie
    // we can't validate). Presence-only was an auth-bypass if the secret leaked/unset.
    return false;
  }
  try {
    await jwtVerify(token, secret); // verifies signature + exp
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const loginUrl = new URL('/auth/login', req.url);
  // Preserve where the user was headed so login can send them back there.
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
  const token = req.cookies.get('auth_token')?.value;

  if (!token || !(await isValidToken(token))) {
    // Clear the stale/invalid cookie so the client stops re-sending it.
    const res = NextResponse.redirect(loginUrl);
    if (token) res.cookies.delete('auth_token');
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/create/:path*',
    '/feed/:path*',
    '/dashboard/:path*',
    '/settings/:path*',
    '/notifications/:path*',
    '/admin/:path*',
    '/saved/:path*',
  ],
};
