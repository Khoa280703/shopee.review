import { Module } from '@nestjs/common';
import { AffiliateLinkGenerator } from './affiliate-link-generator';
import { DirectScraperProvider } from './direct-scraper.provider';
import { SCRAPER_PROVIDER } from './scraper-provider.interface';
import { ScraperService } from './scraper.service';
import { ShopeeApiScraper } from './shopee-api-scraper';
import { ShopeePlaywrightScraper } from './shopee-playwright-fallback-scraper';

@Module({
  providers: [
    ScraperService,
    ShopeeApiScraper,
    ShopeePlaywrightScraper,
    AffiliateLinkGenerator,
    DirectScraperProvider,
    { provide: SCRAPER_PROVIDER, useExisting: DirectScraperProvider },
  ],
  exports: [ScraperService, SCRAPER_PROVIDER],
})
export class ScraperModule {}
