import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.usersService.searchUsers(q ?? '');
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  myStats(@CurrentUser() user: AuthUser) {
    return this.usersService.getUserStats(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.usersService.deleteAccount(user.id);
    res.clearCookie('auth_token', { path: '/' });
    return result;
  }

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  getProfile(@Param('username') username: string, @Req() req: Request) {
    const viewer = req.user as AuthUser | undefined;
    return this.usersService.findByUsername(username, viewer?.id);
  }

  @Get(':username/follow-status')
  @UseGuards(OptionalJwtAuthGuard)
  followStatus(@Param('username') username: string, @Req() req: Request) {
    const viewer = req.user as AuthUser | undefined;
    return this.usersService.followStatus(username, viewer?.id);
  }

  @Get(':username/posts')
  getUserPosts(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('hasProduct') hasProduct?: string,
  ) {
    return this.usersService.getUserPosts(
      username,
      cursor ? Number(cursor) : undefined,
      limit ? Number(limit) : 20,
      hasProduct === 'true',
    );
  }
}
