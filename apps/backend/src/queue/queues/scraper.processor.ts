import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Prisma } from '@app/database';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizeShopeeUrl,
  SCRAPER_PROVIDER,
  type ScraperProvider,
} from '../../scraper/scraper-provider.interface';
import type { ScrapedDealData } from '../../scraper/types/scraped-deal-data';
import { SCRAPER_QUEUE, type ScrapeJob } from '../queue.constants';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Concurrency 4 — Playwright instances; back off if Shopee returns 429/403.
@Processor(SCRAPER_QUEUE, { concurrency: 4 })
export class ScraperProcessor extends WorkerHost {
  private readonly logger = new Logger(ScraperProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCRAPER_PROVIDER) private readonly scraperProvider: ScraperProvider,
  ) {
    super();
  }

  async process(job: Job<ScrapeJob>): Promise<ScrapedDealData> {
    const normalized = normalizeShopeeUrl(job.data.url);

    const cached = await this.prisma.scrapedProduct.findUnique({
      where: { productUrl: normalized },
    });
    if (cached && Date.now() - cached.scrapedAt.getTime() < CACHE_TTL_MS) {
      return cached.data as unknown as ScrapedDealData;
    }

    const data = await this.scraperProvider.scrape(normalized);

    await this.prisma.scrapedProduct.upsert({
      where: { productUrl: normalized },
      create: {
        productUrl: normalized,
        data: data as unknown as Prisma.InputJsonValue,
      },
      update: {
        data: data as unknown as Prisma.InputJsonValue,
        scrapedAt: new Date(),
      },
    });

    return data;
  }
}
