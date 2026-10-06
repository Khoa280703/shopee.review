/**
 * Lowercase + trim an email so every write and lookup treats case as
 * insignificant (Postgres' `@unique` on `email` is byte-exact otherwise,
 * which let `User@x.com` and `user@x.com` collide as two accounts).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
