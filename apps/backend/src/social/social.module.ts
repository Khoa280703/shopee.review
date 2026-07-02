import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsController } from './comments.controller';
import { FollowsController } from './follows.controller';
import { LikesController } from './likes.controller';
import { SocialGateway } from './social.gateway';
import { SocialService } from './social.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [FollowsController, LikesController, CommentsController],
  providers: [SocialService, SocialGateway],
  exports: [SocialService, SocialGateway],
})
export class SocialModule {}
