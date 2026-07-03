import { Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { SocialService } from './social.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly socialService: SocialService) {}

  @Put('posts/:id/bookmark')
  toggle(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.socialService.toggleBookmark(user.id, id);
  }

  @Get('me/bookmarks')
  list(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.socialService.listBookmarks(user.id, cursor ? Number(cursor) : undefined);
  }
}
