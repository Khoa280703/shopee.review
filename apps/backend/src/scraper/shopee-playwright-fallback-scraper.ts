import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium } from 'playwright';
import { ShopeeProductData } from './shopee-api-scraper';

@Injectable()
export class ShopeePlaywrightScraper implements OnModuleDestroy {
  private readonly logger = new Logger(ShopeePlaywrightScraper.name);
  private browser: Browser | null = null;

  async onModuleDestroy() {
    await this.browser?.close();
  }

  async scrapeProduct(productUrl: string): Promise<ShopeeProductData> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh'
    });
    const page = await context.newPage();
    let productData: ShopeeProductData | null = null;

    try {
      page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('/api/v4/pdp/get_pc') && !url.includes('/api/v4/item/get')) return;
        try {
          const json = await response.json();
          const item = json?.data?.item ?? json?.data;
          if (item) productData = item;
        } catch {
          this.logger.debug('Ignored non-JSON Shopee response');
        }
      });
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(4000);
      if (!productData) throw new Error('Browser fallback did not capture product data');
      return productData;
    } finally {
      await context.close();
    }
  }

  private async getBrowser() {
    this.browser ??= await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    return this.browser;
  }
}
