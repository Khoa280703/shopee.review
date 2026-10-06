/**
 * Validate a `?next=`/`authReturnTo` redirect target so it can never become an
 * open redirect (pre-deploy review H1). The old `startsWith('/') &&
 * !startsWith('//')` check was bypassable: browsers normalize a leading
 * backslash to a forward slash for "special" URL schemes, so `/\evil.com` or
 * `/\t/evil.com` both resolve to a different origin (`https://evil.com/`,
 * `https://t/evil.com`) despite passing that string check.
 *
 * This resolves `raw` against `origin` with the actual URL parser and only
 * accepts it if the resolved origin is unchanged — the same normalization the
 * browser itself will apply, so there's no parser-disagreement gap. Control
 * characters and backslashes are rejected outright before parsing as a
 * defense-in-depth belt (some of this already falls out of the origin check,
 * but a literal backslash/control char in the output next-param is never a
 * legitimate case anyway).
 */
export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw) return '/';
  // Intentional: reject raw control chars (defense-in-depth alongside the origin check below).
  if (/[\x00-\x1f\x7f\\]/.test(raw)) return '/';
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return '/';
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return '/';
  }
}
