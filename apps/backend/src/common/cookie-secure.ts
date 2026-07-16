/**
 * Decide the cookie `Secure` flag per-request.
 *
 * A `Secure` cookie is dropped by browsers over plain HTTP, which would silently
 * break login on an HTTP deploy; conversely a non-Secure session cookie over
 * HTTPS is sniffable. So derive it from the actual request scheme by default:
 * with `trust proxy` set, `req.secure` reflects `X-Forwarded-Proto` from the edge
 * (Traefik/nginx). `COOKIE_SECURE=true|false` is an explicit override for edge
 * cases (e.g. TLS terminated by an untrusted hop).
 */
export function resolveCookieSecure(req: { secure?: boolean }): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return req.secure === true;
}
