# Phase 2 — Shopee URL Parser + API-first Scraper + Playwright Fallback + Affiliate Link Generator

## Context Links
- [Research: Shopee Scraping](../reports/researcher-01-shopee-scraping.md)
- [Brainstorm: Scraper approach](../reports/brainstorm-260610-1303-shopee-review-deal-aggregator.md)

## Overview
- **Priority**: P1
- **Status**: completed
- **Effort**: 5h
- **Mô tả**: Module scraper thử Shopee API trực tiếp trước để giảm RAM/latency, fallback sang Playwright browser intercept nếu API fail. Luôn trả partial result để admin edit thủ công.

## Key Insights
<!-- Updated: Validation Session 1 - Scraper strategy: API-first, Playwright fallback -->
- **Strategy: API call trước, Playwright fallback** — thử gọi Shopee API v4 trực tiếp bằng `fetch`. Chỉ dùng Playwright nếu API bị block/thiếu data
- Rate limit 50 req/min (hardcoded safety)
- 2 URL format: standard (`-i.{shopid}.{itemid}`) và short link (`shope.ee/xxx` → redirect)
- Affiliate link = URL encode product URL + append affiliate_id + sub_id
- Price field từ API chia cho 100000 để ra VNĐ
- Scraper phải graceful degrade — trả partial data + warnings nếu fail, admin tự edit phần thiếu
- Không dùng package `playwright-stealth` placeholder. Browser fallback chỉ dùng Playwright core + conservative launch/context options.

## Requirements
### Functional
- Parse shopid + itemid từ Shopee product URL (cả standard + short link)
- Scrape product data: name, price, original_price, discount, images, shop_name, shop_rating, sold_count
- Generate affiliate link từ product URL + config affiliate ID
- Return structured partial data object (match Prisma Deal model where available)
- Handle errors: invalid URL, product not found, Shopee blocked, timeout
- Manual fallback: if scraper cannot get title/price/images, return originalUrl + affiliateUrl + warnings; frontend still opens edit form

### Non-functional
- API scrape target < 5 giây, fallback browser total < 15 giây
- Playwright browser instance lazy init + reuse (không launch nếu API thành công)
- Graceful shutdown browser on app terminate

## Architecture
```
Admin paste URL
       │
       ▼
┌─────────────────┐
│  URL Parser     │
│  extract IDs    │
│  resolve short  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐       fail/blocked/partial       ┌────────────────────┐
│ Shopee API      │──────────────────────────────────▶│ Playwright fallback│
│ get product JSON│                                    │ intercept XHR      │
└────────┬────────┘                                    └─────────┬──────────┘
         │ success/partial                                      │ partial/fail
         └──────────────────────┬───────────────────────────────┘
                                ▼
                       ┌────────────────┐
                       │ Normalize data │
                       │ warnings[]     │
                       └────────┬───────┘
                                ▼
                       ┌────────────────┐
                       │ Affiliate link │
                       └────────┬───────┘
                                ▼
                       ScrapedDealData partial
```

## Related Code Files
### Create
- `apps/backend/src/scraper/scraper.module.ts`
- `apps/backend/src/scraper/scraper.service.ts` — orchestrator
- `apps/backend/src/scraper/shopee-url-parser.ts` — URL parsing + ID extraction
- `apps/backend/src/scraper/shopee-api-scraper.ts` — direct API provider
- `apps/backend/src/scraper/shopee-playwright-fallback-scraper.ts` — browser fallback provider
- `apps/backend/src/scraper/affiliate-link-generator.ts` — URL encoding + affiliate format
- `apps/backend/src/scraper/types/scraped-deal-data.ts` — return type interface

## Implementation Steps

### Step 1: Define scraped data type

`apps/backend/src/scraper/types/scraped-deal-data.ts`:
```typescript
export interface ScrapedDealData {
  title: string | null;
  originalUrl: string;
  affiliateUrl: string;
  originalPrice: number | null;
  salePrice: number | null;
  discountPercent: number | null;
  images: string[];
  shopName: string | null;
  shopRating: number | null;
  soldCount: number | null;
  source: 'api' | 'browser' | 'manual';
  warnings: string[];
}
```

### Step 2: URL Parser

`apps/backend/src/scraper/shopee-url-parser.ts`:
```typescript
import { BadRequestException } from '@nestjs/common';

export interface ShopeeIds {
  shopId: string;
  itemId: string;
  originalUrl: string; // resolved URL (after redirect if short link)
}

const SHOPEE_URL_REGEX = /-i\.(\d+)\.(\d+)/;
const SHOPEE_SHORT_LINK_REGEX = /^https?:\/\/(shope\.ee|s\.shopee\.vn)\//;
const SHOPEE_DOMAIN_REGEX = /^https?:\/\/(www\.)?shopee\.vn\//;

export async function parseShopeeUrl(rawUrl: string): Promise<ShopeeIds> {
  let url = rawUrl.trim();

  // Validate domain
  if (!SHOPEE_DOMAIN_REGEX.test(url) && !SHOPEE_SHORT_LINK_REGEX.test(url)) {
    throw new BadRequestException('URL không phải Shopee link hợp lệ');
  }

  // Resolve short link → follow redirect
  if (SHOPEE_SHORT_LINK_REGEX.test(url)) {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    url = response.url;
    if (!SHOPEE_DOMAIN_REGEX.test(url)) {
      throw new BadRequestException('Short link không redirect về Shopee hợp lệ');
    }
  }

  // Extract shopid + itemid
  const match = url.match(SHOPEE_URL_REGEX);
  if (!match) {
    throw new BadRequestException('Không tìm thấy shopId/itemId trong URL');
  }

  return {
    shopId: match[1],
    itemId: match[2],
    originalUrl: url.split('?')[0], // clean query params
  };
}
```

### Step 3: API Scraper (primary provider)

`apps/backend/src/scraper/shopee-api-scraper.ts`:
```typescript
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
    // Verify exact param names during implementation; Shopee changes internal endpoints.
    // Try `shop_id/item_id` first, then fallback to `shopid/itemid` or `/api/v4/item/get`.
    const url = new URL('https://shopee.vn/api/v4/pdp/get_pc');
    url.searchParams.set('shop_id', shopId);
    url.searchParams.set('item_id', itemId);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0',
          'x-requested-with': 'XMLHttpRequest',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.warn(`Shopee API failed: ${response.status}`);
        return null;
      }

      const json = await response.json();
      return json?.data?.item ?? json?.data ?? null;
    } catch (error) {
      this.logger.warn(`Shopee API error: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }
}
```

### Step 4: Playwright Fallback Scraper (XHR intercept approach)

`apps/backend/src/scraper/shopee-playwright-fallback-scraper.ts`:
```typescript
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Browser, chromium } from 'playwright';

interface ShopeeProductData {
  name: string;
  price: number;          // raw API value, divide by 100000
  price_before_discount: number;
  discount: string;       // e.g. "10%"
  images: string[];
  stock: number;
  historical_sold: number;
  item_rating: {
    rating_star: number;
    rating_count: number[];
  };
  shop_info?: {
    shop_name: string;
    shop_rating: number;
  };
}

@Injectable()
export class ShopeePlaywrightScraper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopeePlaywrightScraper.name);
  private browser: Browser | null = null;

  async onModuleInit() {
    // Lazy init can also be used; keep this simple for MVP service boot.
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    this.logger.log('Playwright browser launched');
  }

  async onModuleDestroy() {
    await this.browser?.close();
    this.logger.log('Playwright browser closed');
  }

  async scrapeProduct(productUrl: string): Promise<ShopeeProductData> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });

    const page = await context.newPage();
    let productData: ShopeeProductData | null = null;

    try {
      // Intercept XHR responses to capture product API data
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/api/v4/pdp/get_pc') || url.includes('/api/v4/item/get')) {
          try {
            const json = await response.json();
            const item = json?.data?.item ?? json?.data;
            if (item) {
              productData = {
                name: item.name,
                price: item.price,
                price_before_discount: item.price_before_discount || item.price,
                discount: item.raw_discount?.toString() || '0',
                images: (item.images || []).map(
                  (hash: string) => `https://down-vn.img.susercontent.com/file/${hash}`,
                ),
                stock: item.stock,
                historical_sold: item.historical_sold || item.sold || 0,
                item_rating: item.item_rating || { rating_star: 0, rating_count: [] },
                shop_info: json.data.shop_info
                  ? {
                      shop_name: json.data.shop_info.shop_name || json.data.shop_info.name,
                      shop_rating: json.data.shop_info.shop_rating || 0,
                    }
                  : undefined,
              };
            }
          } catch {
            // Non-JSON response, skip
          }
        }
      });

      // Navigate to product page
      await page.goto(productUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for XHR to complete (product data loaded)
      await page.waitForTimeout(5000);

      // Fallback: scroll to trigger lazy-loaded API calls
      if (!productData) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(3000);
      }

      if (!productData) {
        throw new Error('Không thể scrape product data — XHR intercept failed');
      }

      return productData;
    } finally {
      await context.close();
    }
  }
}
```

### Step 5: Affiliate Link Generator

`apps/backend/src/scraper/affiliate-link-generator.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AffiliateLinkGenerator {
  private readonly affiliateId: string;

  constructor(private configService: ConfigService) {
    this.affiliateId = this.configService.getOrThrow<string>('SHOPEE_AFFILIATE_ID');
  }

  generate(productUrl: string, subId?: string): string {
    const encodedUrl = encodeURIComponent(productUrl);
    let affiliateUrl = `https://s.shopee.vn/an_redir?origin_link=${encodedUrl}&affiliate_id=${this.affiliateId}`;

    if (subId) {
      affiliateUrl += `&sub_id=${encodeURIComponent(subId)}`;
    }

    return affiliateUrl;
  }
}
```

### Step 6: Scraper Service (orchestrator)

`apps/backend/src/scraper/scraper.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { parseShopeeUrl } from './shopee-url-parser';
import { ShopeeApiScraper, ShopeeProductData } from './shopee-api-scraper';
import { ShopeePlaywrightScraper } from './shopee-playwright-fallback-scraper';
import { AffiliateLinkGenerator } from './affiliate-link-generator';
import { ScrapedDealData } from './types/scraped-deal-data';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly apiScraper: ShopeeApiScraper,
    private readonly playwrightScraper: ShopeePlaywrightScraper,
    private readonly affiliateLinkGenerator: AffiliateLinkGenerator,
  ) {}

  async scrapeShopeeUrl(rawUrl: string): Promise<ScrapedDealData> {
    // 1. Parse URL → extract IDs
    const { shopId, itemId, originalUrl } = await parseShopeeUrl(rawUrl);
    this.logger.log(`Scraping: ${originalUrl}`);

    const warnings: string[] = [];
    let source: ScrapedDealData['source'] = 'api';
    let product: ShopeeProductData | null = await this.apiScraper.scrapeProduct(shopId, itemId);

    if (!product?.name || !product?.price) {
      warnings.push('API scrape thiếu dữ liệu, đã thử browser fallback');
      source = 'browser';
      try {
        product = await this.playwrightScraper.scrapeProduct(originalUrl);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Browser fallback failed');
        source = 'manual';
      }
    }

    // 3. Generate affiliate link even when scrape fails
    const affiliateUrl = this.affiliateLinkGenerator.generate(originalUrl);

    // 4. Transform to partial deal data
    const priceDiv = 100000; // Shopee API price divisor
    const salePrice = product?.price ? Math.round(product.price / priceDiv) : null;
    const rawOriginalPrice = product?.price_before_discount ?? product?.original_price;
    const originalPrice = rawOriginalPrice
      ? Math.round(rawOriginalPrice / priceDiv)
      : salePrice;
    const discountPercent = originalPrice && salePrice && originalPrice > 0
      ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
      : null;

    return {
      title: product?.name ?? null,
      originalUrl,
      affiliateUrl,
      originalPrice,
      salePrice,
      discountPercent,
      images: product?.images ?? [],
      shopName: product?.shop_info?.shop_name || product?.shop_info?.name || null,
      shopRating: product?.shop_info?.shop_rating || product?.item_rating?.rating_star || null,
      soldCount: product?.historical_sold || product?.sold || null,
      source,
      warnings,
    };
  }
}
```

### Step 7: Scraper Module

`apps/backend/src/scraper/scraper.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ShopeeApiScraper } from './shopee-api-scraper';
import { ShopeePlaywrightScraper } from './shopee-playwright-fallback-scraper';
import { AffiliateLinkGenerator } from './affiliate-link-generator';

@Module({
  providers: [ScraperService, ShopeeApiScraper, ShopeePlaywrightScraper, AffiliateLinkGenerator],
  exports: [ScraperService],
})
export class ScraperModule {}
```

### Step 8: Install Playwright browser binaries
```bash
cd apps/backend
pnpm exec playwright install chromium --with-deps
```

**LƯU Ý**: Cần chạy command này sau `pnpm install` và trong Dockerfile production.

## Todo List
- [x] Create types/scraped-deal-data.ts interface
- [x] Implement shopee-url-parser.ts (standard + short link)
- [x] Implement shopee-api-scraper.ts (primary API provider)
- [x] Implement shopee-playwright-fallback-scraper.ts (XHR intercept fallback)
- [x] Implement affiliate-link-generator.ts
- [x] Implement scraper.service.ts (API-first provider chain + partial result)
- [x] Create scraper.module.ts, wire providers
- [x] Install playwright + chromium binaries
- [x] Unit test URL parser, short link final-host validation, affiliate generator
- [x] Unit test API fail → browser fallback → manual partial warnings
- [x] Test scrape real Shopee product URL end-to-end
- [x] Verify affiliate link format correct
- [x] Handle edge cases: product deleted, timeout, CAPTCHA

## Success Criteria
- `scraperService.scrapeShopeeUrl(url)` trả về ScrapedDealData đúng format, không throw nếu Shopee block nhưng URL hợp lệ
- API provider được gọi trước Playwright fallback
- API scrape < 5s khi thành công; browser fallback tổng < 15s
- Affiliate link redirect đúng đến sản phẩm
- Short link (shope.ee) resolve và scrape thành công
- Error handling: invalid URL throw BadRequestException; valid URL + scrape fail returns `source: 'manual'` + warnings

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Shopee direct API bị block | High | Browser fallback + manual partial result |
| Shopee thay đổi API response structure | High | Defensive parsing, optional fields, provider abstraction |
| CAPTCHA trigger | Medium | Rate limit, browser fallback conservative context, manual fallback |
| Playwright crash/memory leak | Medium | Context close in finally, browser restart on error |
| Price divisor thay đổi | Low | Config constant, verify trước khi deploy |
| Browser fallback bị detect | Medium | Do not block admin flow; return manual result |

## Security Considerations
- Không store Shopee session cookies trong DB
- Rate limit scraper endpoint with `@Throttle()` and JWT protected
- Validate URL domain trước và sau short-link redirect (prevent SSRF/open redirect)
- Timeout 30s cho page load, 15s tổng cho scrape flow

## Next Steps
- Phase 3: Wire scraper vào deals CRUD — admin paste URL → call scraper → return data → admin edit → save deal
