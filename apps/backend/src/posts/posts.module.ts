import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScraperModule } from '../scraper/scraper.module';
import { PostsController } from './posts.controller';
import { PostsMeController } from './posts-me.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [PrismaModule, ScraperModule],
  controllers: [PostsController, PostsMeController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
