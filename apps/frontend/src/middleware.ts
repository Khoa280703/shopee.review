import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED = ['/create', '/feed', '/dashboard', '/settings', '/notifications', '/admin'];

// JWT_SECRET is server-only (NOT NEXT_PUBLIC). Must match the backend's secret
// so the middleware can validate the same HS256 token set by AuthService.
const secret = process.env.JWT_SECRET
  ? new TextEncoder().encode(process.env.JWT_SECRET)
  : null;

async function isValidToken(token: string): Promise<boolean> {
  if (!secret) {
    // No secret configured at the edge: presence-only check (legacy behavior).
    return true;
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
  ],
};
