import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsController } from './comments.controller';
import { FollowsController } from './follows.controller';
import { LikesController } from './likes.controller';
import { SocialService } from './social.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FollowsController, LikesController, CommentsController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
