import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Queue } from 'bullmq';
import type { Gauge } from 'prom-client';
import { SocialGateway } from '../social/social.gateway';
import {
  EMAIL_QUEUE,
  INDEX_QUEUE,
  NOTIFICATION_QUEUE,
  SCRAPER_QUEUE,
} from '../queue/queue.constants';
import { QUEUE_DEPTH, WEBSOCKET_CONNECTIONS } from './metrics.providers';

/**
 * Periodically samples runtime-only signals that have no natural hook:
 * live WebSocket connections and per-queue backlog. Queues are optional —
 * absent when REDIS_URL is unset (host dev), in which case depth stays 0.
 */
@Injectable()
export class MetricsCollectorService {
  constructor(
    @InjectMetric(WEBSOCKET_CONNECTIONS) private readonly wsGauge: Gauge<string>,
    @InjectMetric(QUEUE_DEPTH) private readonly queueGauge: Gauge<string>,
    private readonly gateway: SocialGateway,
    @Optional() @InjectQueue(EMAIL_QUEUE) private readonly emailQueue?: Queue,
    @Optional() @InjectQueue(SCRAPER_QUEUE) private readonly scraperQueue?: Queue,
    @Optional()
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue?: Queue,
    @Optional() @InjectQueue(INDEX_QUEUE) private readonly indexQueue?: Queue,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async collect(): Promise<void> {
    this.wsGauge.set(this.gateway.getConnectionCount());

    const queues: Array<[string, Queue | undefined]> = [
      [EMAIL_QUEUE, this.emailQueue],
      [SCRAPER_QUEUE, this.scraperQueue],
      [NOTIFICATION_QUEUE, this.notificationQueue],
      [INDEX_QUEUE, this.indexQueue],
    ];

    for (const [name, queue] of queues) {
      if (!queue) continue;
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed');
        const depth =
          (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
        this.queueGauge.set({ queue: name }, depth);
      } catch {
        // Redis hiccup — skip this tick rather than crash the scheduler.
      }
    }
  }
}
