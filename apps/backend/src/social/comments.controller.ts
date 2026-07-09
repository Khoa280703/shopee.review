import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { parsePageParams } from '../common/parse-page-params';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SocialService } from './social.service';

@Controller()
export class CommentsController {
  constructor(private readonly socialService: SocialService) {}

  @Get('posts/:id/comments')
  getComments(
    @Param('id', ParseIntPipe) id: number,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = parsePageParams(cursor, limit, { def: 20, max: 50 });
    return this.socialService.getComments(id, page.cursor, page.limit);
  }

  @Get('posts/:id/comments/:parentId/replies')
  getReplies(
    @Param('id', ParseIntPipe) id: number,
    @Param('parentId', ParseIntPipe) parentId: number,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = parsePageParams(cursor, limit, { def: 10, max: 50 });
    return this.socialService.getReplies(id, parentId, page.cursor, page.limit);
  }

  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
  ) {
    return this.socialService.addComment(user.id, id, dto.content, dto.parentId);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  deleteComment(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.socialService.deleteComment(user.id, id);
  }
}
