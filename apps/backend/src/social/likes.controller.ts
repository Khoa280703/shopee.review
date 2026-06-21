import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { SocialService } from './social.service';

@Controller('posts')
export class LikesController {
  constructor(private readonly socialService: SocialService) {}

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.socialService.likePost(user.id, id);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.socialService.unlikePost(user.id, id);
  }

  @Get(':id/likes/count')
  @UseGuards(OptionalJwtAuthGuard)
  likeStatus(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const viewer = req.user as AuthUser | undefined;
    return this.socialService.likeStatus(id, viewer?.id);
  }
}
