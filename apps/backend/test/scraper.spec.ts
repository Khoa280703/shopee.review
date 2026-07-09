import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { AffiliateLinkGenerator } from '../src/scraper/affiliate-link-generator';
import { ScraperService } from '../src/scraper/scraper.service';
import { parseShopeeUrl } from '../src/scraper/shopee-url-parser';

describe('parseShopeeUrl', () => {
  it('extracts shop and item ids from a standard URL', async () => {
    await expect(parseShopeeUrl('https://shopee.vn/foo-i.123.456?x=1')).resolves.toEqual({
      shopId: '123',
      itemId: '456',
      originalUrl: 'https://shopee.vn/foo-i.123.456'
    });
  });

  it('rejects non-Shopee URLs', async () => {
    await expect(parseShopeeUrl('https://example.com/foo-i.123.456')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks SSRF: a short link laundering to an internal host is refused, not fetched', async () => {
    // s.shopee.vn is an open redirector; simulate it 302-ing to the cloud
    // metadata endpoint. The guard must reject on the internal hop and must NOT
    // issue a fetch to that internal host.
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('https://s.shopee.vn/')) {
        return { headers: { get: () => 'http://169.254.169.254/latest/meta-data' } } as unknown as Response;
      }
      throw new Error(`SSRF: internal host was fetched: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        parseShopeeUrl('https://s.shopee.vn/an_redir?origin_link=http://169.254.169.254'),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Only the s.shopee.vn hop was fetched; the internal host never was.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('s.shopee.vn');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resolves a legitimate short link that redirects to shopee.vn', async () => {
    // shope.ee → shopee.vn (one hop), then shopee.vn has no Location → stop.
    const fetchMock = vi.fn(async (input: string) => ({
      headers: {
        get: () => (input.startsWith('https://shope.ee/') ? 'https://shopee.vn/real-i.111.222' : null),
      },
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(parseShopeeUrl('https://shope.ee/abc')).resolves.toEqual({
        shopId: '111',
        itemId: '222',
        originalUrl: 'https://shopee.vn/real-i.111.222',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('AffiliateLinkGenerator', () => {
  it('generates encoded Shopee affiliate links when an affiliate id is set', () => {
    const config = { get: () => 'affiliate-1' } as unknown as ConfigService;
    const link = new AffiliateLinkGenerator(config).generate('https://shopee.vn/foo-i.1.2', 'deal-2');
    expect(link).toContain('https://s.shopee.vn/an_redir?');
    expect(link).toContain('affiliate_id=affiliate-1');
    expect(link).toContain('sub_id=deal-2');
    expect(link).toContain('origin_link=https%3A%2F%2Fshopee.vn%2Ffoo-i.1.2');
  });

  it('degrades to the plain product URL when SHOPEE_AFFILIATE_ID is unset', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const link = new AffiliateLinkGenerator(config).generate('https://shopee.vn/foo-i.1.2');
    expect(link).toBe('https://shopee.vn/foo-i.1.2');
  });
});

describe('ScraperService', () => {
  it('returns manual partial data when API and browser fallback fail', async () => {
    const service = new ScraperService(
      { scrapeProduct: vi.fn().mockResolvedValue(null) },
      { scrapeProduct: vi.fn().mockRejectedValue(new Error('blocked')) },
      { generate: vi.fn().mockReturnValue('affiliate-url') }
    );

    const result = await service.scrapeShopeeUrl('https://shopee.vn/foo-i.123.456');
    expect(result.source).toBe('manual');
    expect(result.originalUrl).toBe('https://shopee.vn/foo-i.123.456');
    expect(result.affiliateUrl).toBe('affiliate-url');
    expect(result.title).toBeNull();
    expect(result.warnings).toContain('blocked');
  });
});
