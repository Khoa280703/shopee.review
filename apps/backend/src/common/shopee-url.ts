import { BadRequestException } from '@nestjs/common';

/**
 * Shopee host validation shared by post create/update and the click tracker.
 *
 * Two host tiers:
 *  - PRODUCT hosts serve real product detail pages (safe redirect destinations).
 *  - REDIRECTOR hosts (Shopee's own short-link / affiliate `an_redir` service)
 *    forward to a `origin_link` destination. `s.shopee.vn/an_redir?origin_link=X`
 *    is effectively an open redirector, so when the URL is a redirector we MUST
 *    validate that its embedded destination is itself a Shopee product host —
 *    otherwise `affiliateUrl=https://s.shopee.vn/an_redir?origin_link=https://evil.com`
 *    launders a phishing redirect through our trusted domain.
 */
export const SHOPEE_PRODUCT_HOSTS = ['shopee.vn', 'shopee.com'];
export const SHOPEE_REDIRECTOR_HOSTS = ['s.shopee.vn', 'shope.ee', 'shp.ee'];
export const SHOPEE_HOSTS = [...SHOPEE_PRODUCT_HOSTS, ...SHOPEE_REDIRECTOR_HOSTS];

// Query params Shopee redirectors use to carry the forward destination.
const DEST_PARAMS = ['origin_link', 'redir', 'url'];

function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * A product host serves real product pages. `s.shopee.vn` technically ends with
 * `.shopee.vn` but is a REDIRECTOR, so it must be excluded — otherwise a nested
 * `origin_link=https://s.shopee.vn/an_redir?...` would be mistaken for a safe
 * product destination and re-open the laundering hole.
 */
function isProductHost(host: string): boolean {
  return hostMatches(host, SHOPEE_PRODUCT_HOSTS) && !hostMatches(host, SHOPEE_REDIRECTOR_HOSTS);
}

function parseUrl(url: string): URL {
  try {
    return new URL(url.trim());
  } catch {
    throw new BadRequestException('URL không hợp lệ');
  }
}

/** True when the URL host is any Shopee host (product or redirector). */
export function isShopeeHost(url: string): boolean {
  try {
    return hostMatches(new URL(url.trim()).hostname.toLowerCase(), SHOPEE_HOSTS);
  } catch {
    return false;
  }
}

/** productUrl must point at a real product host, never a redirector. */
export function assertShopeeProductUrl(url: string): void {
  const host = parseUrl(url).hostname.toLowerCase();
  if (!isProductHost(host)) {
    throw new BadRequestException('Link sản phẩm phải thuộc Shopee');
  }
}

/**
 * affiliateUrl may be a product URL OR a Shopee redirector/affiliate link (the
 * user keeps their own affiliate link so they earn commission). But if it is a
 * redirector, its destination must resolve to a Shopee product host — this is
 * what blocks the open-redirect laundering described above.
 */
export function assertShopeeAffiliateUrl(url: string): void {
  const parsed = parseUrl(url);
  const host = parsed.hostname.toLowerCase();
  if (!hostMatches(host, SHOPEE_HOSTS)) {
    throw new BadRequestException('Link affiliate phải thuộc Shopee');
  }
  if (hostMatches(host, SHOPEE_REDIRECTOR_HOSTS)) {
    // Validate EVERY value of EVERY known destination param (getAll, not get):
    // guards against HTTP parameter pollution (?origin_link=good&origin_link=evil)
    // and secondary params (?origin_link=good&redir=evil) where Shopee might
    // honor a value we didn't check. Any non-product destination → reject.
    const dests = DEST_PARAMS.flatMap((p) => parsed.searchParams.getAll(p));
    for (const dest of dests) {
      // A destination host that is itself a redirector (nested) is rejected here
      // because it is not a PRODUCT host — this blocks nested laundering too.
      const destHost = parseUrl(dest).hostname.toLowerCase();
      if (!isProductHost(destHost)) {
        throw new BadRequestException('Đích của link affiliate không phải sản phẩm Shopee');
      }
    }
    // Bare Shopee short links with no destination param (e.g. shope.ee/abc) are
    // Shopee-controlled and forward only to Shopee content — allowed.
  }
}

/** Non-throwing variant for the tracker fallback path. */
export function isValidAffiliateUrl(url: string): boolean {
  try {
    assertShopeeAffiliateUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidProductUrl(url: string): boolean {
  try {
    assertShopeeProductUrl(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a comma-separated origin list (FRONTEND_URL) into trimmed, trailing-slash
 * -normalized entries for exact-match CORS. Shared shape with the socket gateway.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw || 'http://localhost:5166')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
