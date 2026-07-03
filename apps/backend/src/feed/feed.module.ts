import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlocksModule } from '../moderation/blocks.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [PrismaModule, BlocksModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
