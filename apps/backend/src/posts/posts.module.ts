import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScraperModule } from '../scraper/scraper.module';
import { PostsController } from './posts.controller';
import { PostsMeController } from './posts-me.controller';
import { PostsService } from './posts.service';
import { TrendingRefreshService } from './trending-refresh.service';

@Module({
  imports: [PrismaModule, ScraperModule, NotificationsModule],
  controllers: [PostsController, PostsMeController],
  providers: [PostsService, TrendingRefreshService],
  exports: [PostsService],
})
export class PostsModule {}
