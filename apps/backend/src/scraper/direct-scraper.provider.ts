import { Injectable } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import type { ScraperProvider } from './scraper-provider.interface';
import type { ScrapedDealData } from './types/scraped-deal-data';

@Injectable()
export class DirectScraperProvider implements ScraperProvider {
  constructor(private readonly scraperService: ScraperService) {}

  scrape(url: string): Promise<ScrapedDealData> {
    return this.scraperService.scrapeShopeeUrl(url);
  }
}
