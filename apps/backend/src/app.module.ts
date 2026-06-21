import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthController } from './health.controller';
import { FeedModule } from './feed/feed.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';
import { SocialModule } from './social/social.module';
import { StatsModule } from './stats/stats.module';
import { TrackerModule } from './tracker/tracker.module';
import { ScraperModule } from './scraper/scraper.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: ['.env', '../../.env'], isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    PostsModule,
    SocialModule,
    NotificationsModule,
    FeedModule,
    StatsModule,
    TrackerModule,
    SearchModule,
    CategoriesModule,
    ScraperModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
