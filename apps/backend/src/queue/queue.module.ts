import { BullModule } from '@nestjs/bullmq';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Global, Logger, Module, type DynamicModule } from '@nestjs/common';
import { MailModule } from '../auth/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScraperModule } from '../scraper/scraper.module';
import { bullBoardAuth } from './bull-board-auth';
import {
  EMAIL_QUEUE,
  INDEX_QUEUE,
  NOTIFICATION_QUEUE,
  SCRAPER_QUEUE,
} from './queue.constants';
import { EmailProcessor } from './queues/email.processor';
import { IndexProcessor } from './queues/index.processor';
import { NotificationProcessor } from './queues/notification.processor';
import { ScraperProcessor } from './queues/scraper.processor';

/**
 * BullMQ queues — only active when REDIS_URL is set (production / Docker).
 * On host dev without Redis, this is an empty global module; consumer services
 * inject queues with `@Optional()` and fall back to synchronous execution.
 */
@Global()
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    if (!process.env.REDIS_URL) {
      new Logger(QueueModule.name).log(
        'REDIS_URL not set — queues disabled (sync fallback).',
      );
      return { module: QueueModule, global: true };
    }

    return {
      module: QueueModule,
      global: true,
      imports: [
        PrismaModule,
        MailModule,
        ScraperModule,
        BullModule.forRoot({ connection: { url: process.env.REDIS_URL } }),
        BullModule.registerQueue(
          {
            name: EMAIL_QUEUE,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: { age: 3600 },
              removeOnFail: { age: 86400 },
            },
          },
          {
            name: SCRAPER_QUEUE,
            defaultJobOptions: {
              attempts: 2,
              backoff: { type: 'fixed', delay: 5000 },
              removeOnComplete: { age: 3600 },
              removeOnFail: { age: 86400 },
            },
          },
          {
            name: NOTIFICATION_QUEUE,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: { age: 3600 },
              removeOnFail: { age: 86400 },
            },
          },
          {
            name: INDEX_QUEUE,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: { age: 3600 },
              removeOnFail: { age: 86400 },
            },
          },
        ),
        BullBoardModule.forRoot({
          route: '/admin/queues',
          adapter: ExpressAdapter,
          middleware: bullBoardAuth,
        }),
        BullBoardModule.forFeature(
          { name: EMAIL_QUEUE, adapter: BullMQAdapter },
          { name: SCRAPER_QUEUE, adapter: BullMQAdapter },
          { name: NOTIFICATION_QUEUE, adapter: BullMQAdapter },
          { name: INDEX_QUEUE, adapter: BullMQAdapter },
        ),
      ],
      providers: [
        EmailProcessor,
        ScraperProcessor,
        NotificationProcessor,
        IndexProcessor,
      ],
      exports: [BullModule],
    };
  }
}
