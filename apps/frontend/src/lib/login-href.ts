import { safeNext } from './safe-next';

/**
 * Build a `/auth/login?next=...` href that returns the user to where they
 * were after logging in (FE audit M8). `path` must already be a same-origin
 * relative path (e.g. from `usePathname()` + `useSearchParams()`) — never
 * pass a full URL or anything user-controlled without validating it first.
 *
 * Validated through the same `safeNext` (H1) the login/register/callback
 * pages use to read `next` back out, so a single origin-check implementation
 * guards both directions. The fixed placeholder origin below is only used to
 * resolve `path` against — `safeNext` rejects anything that would resolve to
 * a *different* origin, which also catches a scheme-relative/backslash path
 * slipped in here by mistake.
 */
export function loginHref(path: string): string {
  const safe = safeNext(path, 'http://internal.invalid');
  // safeNext falls back to '/' for both "already root" and "rejected" inputs;
  // either way the login page's own default (no `next`) is correct.
  if (safe === '/') return '/auth/login';
  return `/auth/login?next=${encodeURIComponent(safe)}`;
}
