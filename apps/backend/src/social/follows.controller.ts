import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { SocialService } from './social.service';

@Controller('users')
export class FollowsController {
  constructor(private readonly socialService: SocialService) {}

  @Post(':username/follow')
  @UseGuards(JwtAuthGuard)
  follow(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.socialService.follow(user.id, username);
  }

  @Delete(':username/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.socialService.unfollow(user.id, username);
  }

  @Get(':username/followers')
  followers(@Param('username') username: string) {
    return this.socialService.listFollowers(username);
  }

  @Get(':username/following')
  following(@Param('username') username: string) {
    return this.socialService.listFollowing(username);
  }
}
