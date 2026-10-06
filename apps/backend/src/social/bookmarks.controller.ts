import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { SetBookmarkDto } from './dto/set-bookmark.dto';
import { SocialService } from './social.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly socialService: SocialService) {}

  @Get('posts/:id/bookmark')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.socialService.bookmarkStatus(id, user.id);
  }

  // Idempotent set — body states the desired end state (not a toggle).
  @Put('posts/:id/bookmark')
  setBookmark(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetBookmarkDto,
  ) {
    return this.socialService.setBookmark(user.id, id, dto.bookmarked);
  }

  @Get('me/bookmarks')
  list(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.socialService.listBookmarks(user.id, cursor ? Number(cursor) : undefined);
  }
}
