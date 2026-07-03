import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

/**
 * BlocksService depends only on Prisma, so it lives in its own module that both
 * SocialModule (comment/reaction guards), FeedModule (exclusion), and
 * ModerationModule can import without creating a dependency cycle.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
