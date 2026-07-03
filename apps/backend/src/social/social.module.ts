import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlocksModule } from '../moderation/blocks.module';
import { CommentsController } from './comments.controller';
import { FollowsController } from './follows.controller';
import { ReactionsController } from './reactions.controller';
import { BookmarksController } from './bookmarks.controller';
import { SocialGateway } from './social.gateway';
import { SocialService } from './social.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BlocksModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [FollowsController, ReactionsController, BookmarksController, CommentsController],
  providers: [SocialService, SocialGateway],
  exports: [SocialService, SocialGateway],
})
export class SocialModule {}
