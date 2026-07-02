import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertShopeeAffiliateUrl,
  assertShopeeProductUrl,
  isShopeeHost,
  isValidAffiliateUrl,
  parseAllowedOrigins,
} from '../src/common/shopee-url';

// ---------------------------------------------------------------------------
// Phase 1 — open redirect: Shopee host + affiliate destination validation
// ---------------------------------------------------------------------------
describe('shopee-url validation', () => {
  it('accepts real product hosts', () => {
    expect(() => assertShopeeProductUrl('https://shopee.vn/product-i.123.456')).not.toThrow();
    expect(() => assertShopeeProductUrl('https://www.shopee.vn/x')).not.toThrow();
    expect(isShopeeHost('https://shopee.vn/x')).toBe(true);
  });

  it('rejects non-Shopee product URLs and subdomain look-alikes', () => {
    expect(() => assertShopeeProductUrl('https://evil.com/x')).toThrow(BadRequestException);
    expect(() => assertShopeeProductUrl('https://shopee.vn.evil.com/x')).toThrow(BadRequestException);
    expect(isShopeeHost('https://shopee.vn.evil.com/x')).toBe(false);
  });

  it('accepts a user affiliate link whose destination is a Shopee product (commission preserved)', () => {
    expect(() =>
      assertShopeeAffiliateUrl(
        'https://s.shopee.vn/an_redir?origin_link=https://shopee.vn/p-i.1.2&affiliate_id=me',
      ),
    ).not.toThrow();
  });

  it('BLOCKS open-redirect laundering via an_redir destination', () => {
    expect(() =>
      assertShopeeAffiliateUrl('https://s.shopee.vn/an_redir?origin_link=https://evil.com'),
    ).toThrow(BadRequestException);
    expect(
      isValidAffiliateUrl('https://s.shopee.vn/an_redir?origin_link=https://evil.com'),
    ).toBe(false);
  });

  it('BLOCKS nested redirector laundering (origin_link points to another redirector)', () => {
    expect(() =>
      assertShopeeAffiliateUrl(
        'https://s.shopee.vn/an_redir?origin_link=https://s.shopee.vn/an_redir?origin_link=https://evil.com',
      ),
    ).toThrow(BadRequestException);
  });

  it('BLOCKS HTTP parameter pollution (duplicate origin_link, evil second value)', () => {
    expect(() =>
      assertShopeeAffiliateUrl(
        'https://s.shopee.vn/an_redir?origin_link=https://shopee.vn/p-i.1.2&origin_link=https://evil.com',
      ),
    ).toThrow(BadRequestException);
  });

  it('BLOCKS a secondary destination param (redir=evil alongside a good origin_link)', () => {
    expect(() =>
      assertShopeeAffiliateUrl(
        'https://s.shopee.vn/an_redir?origin_link=https://shopee.vn/p-i.1.2&redir=https://evil.com',
      ),
    ).toThrow(BadRequestException);
  });

  it('BLOCKS userinfo @ host confusion in the destination', () => {
    expect(() =>
      assertShopeeAffiliateUrl('https://s.shopee.vn/an_redir?origin_link=https://shopee.vn@evil.com'),
    ).toThrow(BadRequestException);
  });

  it('allows bare Shopee short links (no destination param, Shopee-controlled)', () => {
    expect(() => assertShopeeAffiliateUrl('https://shope.ee/abc123')).not.toThrow();
  });

  it('rejects entirely non-Shopee affiliate URLs', () => {
    expect(() => assertShopeeAffiliateUrl('https://evil.com/x')).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — CORS exact-match origin parsing
// ---------------------------------------------------------------------------
describe('parseAllowedOrigins', () => {
  it('splits, trims, and strips trailing slashes', () => {
    expect(parseAllowedOrigins('https://a.com/, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('does not match a suffix-attack origin (exact match only)', () => {
    const allowed = parseAllowedOrigins('https://shopee.review');
    // exact-match semantics live at the call site; here we prove the list is clean
    expect(allowed).toEqual(['https://shopee.review']);
    expect(allowed.includes('https://shopee.review.evil.com')).toBe(false);
  });

  it('falls back to localhost dev origin when unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:5166']);
  });
});
