import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MeilisearchService } from '../../search/meilisearch.service';
import { INDEX_JOB, INDEX_QUEUE, type IndexJob } from '../queue.constants';

// Async Meilisearch indexing — keeps post create/update/delete off the search path.
@Processor(INDEX_QUEUE, { concurrency: 4 })
export class IndexProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexProcessor.name);

  constructor(private readonly meili: MeilisearchService) {
    super();
  }

  async process(job: Job<IndexJob>): Promise<void> {
    switch (job.name) {
      case INDEX_JOB.UPSERT:
        await this.meili.indexPost(job.data.postId);
        return;
      case INDEX_JOB.DELETE:
        await this.meili.deletePost(job.data.postId);
        return;
      default:
        this.logger.warn(`Unknown index job: ${job.name}`);
    }
  }
}
