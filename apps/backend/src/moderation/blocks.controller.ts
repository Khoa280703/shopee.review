import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { BlocksService } from './blocks.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post('users/:username/block')
  block(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.blocks.block(user.id, username);
  }

  @Delete('users/:username/block')
  unblock(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.blocks.unblock(user.id, username);
  }

  @Get('me/blocks')
  listBlocked(@CurrentUser() user: AuthUser) {
    return this.blocks.listBlocked(user.id);
  }
}
