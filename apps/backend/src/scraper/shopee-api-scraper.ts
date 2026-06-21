import { Injectable, Logger } from '@nestjs/common';

export interface ShopeeProductData {
  name?: string;
  price?: number;
  price_before_discount?: number;
  original_price?: number;
  raw_discount?: number;
  images?: string[];
  historical_sold?: number;
  sold?: number;
  item_rating?: { rating_star?: number };
  shop_info?: { shop_name?: string; name?: string; shop_rating?: number };
}

@Injectable()
export class ShopeeApiScraper {
  private readonly logger = new Logger(ShopeeApiScraper.name);

  async scrapeProduct(shopId: string, itemId: string): Promise<ShopeeProductData | null> {
    for (const url of this.buildCandidateUrls(shopId, itemId)) {
      const product = await this.fetchCandidate(url);
      if (product) return product;
    }
    return null;
  }

  private buildCandidateUrls(shopId: string, itemId: string): URL[] {
    const pdp = new URL('https://shopee.vn/api/v4/pdp/get_pc');
    pdp.searchParams.set('shop_id', shopId);
    pdp.searchParams.set('item_id', itemId);

    const item = new URL('https://shopee.vn/api/v4/item/get');
    item.searchParams.set('shopid', shopId);
    item.searchParams.set('itemid', itemId);
    return [pdp, item];
  }

  private async fetchCandidate(url: URL): Promise<ShopeeProductData | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0',
          'x-requested-with': 'XMLHttpRequest'
        }
      });
      if (!response.ok) {
        this.logger.warn(`Shopee API failed ${response.status}: ${url.pathname}`);
        return null;
      }
      const json = await response.json();
      return json?.data?.item ?? json?.data ?? null;
    } catch (error) {
      this.logger.warn(`Shopee API error: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
