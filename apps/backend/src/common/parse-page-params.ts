/**
 * Clamp untrusted cursor-pagination query params at the HTTP boundary.
 *
 * Raw `Number(limit)` from `@Query` let a caller pass `limit=1000000` (unbounded
 * scan / DoS) or `cursor=abc` → `NaN` → the Prisma `cursor: { id: NaN }` lookup
 * throws a Postgres error (500). This normalizes both:
 *  - limit  → integer in [1, max], falling back to `def` on missing/invalid.
 *  - cursor → positive integer, or `undefined` (first page) when missing/invalid.
 */
export interface PageParams {
  cursor?: number;
  limit: number;
}

export function parsePageParams(
  cursorRaw?: string,
  limitRaw?: string,
  opts: { def?: number; max?: number } = {},
): PageParams {
  const def = opts.def ?? 20;
  const max = opts.max ?? 50;

  let limit = def;
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    limit = Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : def;
  }

  let cursor: number | undefined;
  if (cursorRaw !== undefined) {
    const c = Number(cursorRaw);
    cursor = Number.isInteger(c) && c > 0 ? c : undefined;
  }

  return { cursor, limit };
}
