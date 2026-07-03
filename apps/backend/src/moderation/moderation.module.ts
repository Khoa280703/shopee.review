import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsModule } from '../posts/posts.module';
import { SocialModule } from '../social/social.module';
import { BlocksModule } from './blocks.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, BlocksModule, PostsModule, SocialModule],
  controllers: [ReportsController, AdminController],
  providers: [ReportsService, AdminService, AdminBootstrapService],
})
export class ModerationModule {}
