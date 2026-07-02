import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MeilisearchService } from './meilisearch.service';

// Global so PostsService (CRUD index hooks) and the index queue processor can
// inject MeilisearchService without import cycles.
@Global()
@Module({
  imports: [PrismaModule],
  providers: [MeilisearchService],
  exports: [MeilisearchService],
})
export class MeilisearchModule {}
