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
