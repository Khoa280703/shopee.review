import { Injectable, Logger } from '@nestjs/common';
import { AffiliateLinkGenerator } from './affiliate-link-generator';
import { ShopeeApiScraper, ShopeeProductData } from './shopee-api-scraper';
import { ShopeePlaywrightScraper } from './shopee-playwright-fallback-scraper';
import { parseShopeeUrl } from './shopee-url-parser';
import { ScrapedDealData } from './types/scraped-deal-data';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly apiScraper: ShopeeApiScraper,
    private readonly playwrightScraper: ShopeePlaywrightScraper,
    private readonly affiliateLinkGenerator: AffiliateLinkGenerator
  ) {}

  async scrapeShopeeUrl(rawUrl: string): Promise<ScrapedDealData> {
    const { shopId, itemId, originalUrl } = await parseShopeeUrl(rawUrl);
    const warnings: string[] = [];
    let source: ScrapedDealData['source'] = 'api';
    let product = await this.apiScraper.scrapeProduct(shopId, itemId);

    if (!product?.name || !product?.price) {
      warnings.push('API scrape thiếu dữ liệu, đã thử browser fallback');
      source = 'browser';
      try {
        product = await this.playwrightScraper.scrapeProduct(originalUrl);
      } catch (error) {
        this.logger.warn(error instanceof Error ? error.message : 'Browser fallback failed');
        warnings.push(error instanceof Error ? error.message : 'Browser fallback failed');
        source = 'manual';
      }
    }

    const affiliateUrl = this.affiliateLinkGenerator.generate(originalUrl);
    return this.normalize(product, originalUrl, affiliateUrl, source, warnings);
  }

  private normalize(
    product: ShopeeProductData | null,
    originalUrl: string,
    affiliateUrl: string,
    source: ScrapedDealData['source'],
    warnings: string[]
  ): ScrapedDealData {
    const priceDivisor = 100000;
    const salePrice = product?.price ? Math.round(product.price / priceDivisor) : null;
    const rawOriginalPrice = product?.price_before_discount ?? product?.original_price;
    const originalPrice = rawOriginalPrice ? Math.round(rawOriginalPrice / priceDivisor) : salePrice;
    const discountPercent =
      originalPrice && salePrice && originalPrice > 0
        ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
        : null;

    return {
      title: product?.name ?? null,
      originalUrl,
      affiliateUrl,
      originalPrice,
      salePrice,
      discountPercent,
      images: this.normalizeImages(product?.images ?? []),
      shopName: product?.shop_info?.shop_name || product?.shop_info?.name || null,
      shopRating: product?.shop_info?.shop_rating || product?.item_rating?.rating_star || null,
      soldCount: product?.historical_sold || product?.sold || null,
      source,
      warnings
    };
  }

  private normalizeImages(images: string[]): string[] {
    return images.map((image) => {
      if (image.startsWith('http')) return image;
      return `https://down-vn.img.susercontent.com/file/${image}`;
    });
  }
}
