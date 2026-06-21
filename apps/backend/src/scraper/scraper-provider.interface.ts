import type { ScrapedDealData } from './types/scraped-deal-data';

export const SCRAPER_PROVIDER = Symbol('SCRAPER_PROVIDER');

/**
 * Abstraction so a proxy/browser pool provider can be swapped in later via DI
 * without changing PostsService. MVP uses DirectScraperProvider.
 */
export interface ScraperProvider {
  scrape(url: string): Promise<ScrapedDealData>;
}

/**
 * Strips Shopee tracking params so the same product maps to one cache key.
 */
export function normalizeShopeeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    return trimmed.split('?')[0];
  }
}
