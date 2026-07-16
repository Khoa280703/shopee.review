import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import type { Request } from 'express';
import { ReactionType } from '@app/database';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { SocialService } from './social.service';

class ReactDto {
  @IsEnum(ReactionType)
  type!: ReactionType;
}

@Controller('posts')
export class ReactionsController {
  constructor(private readonly socialService: SocialService) {}

  // Upsert/toggle a reaction. Replaces the old POST/DELETE :id/like pair.
  @Put(':id/reactions')
  @UseGuards(JwtAuthGuard)
  react(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReactDto,
  ) {
    return this.socialService.react(user.id, id, dto.type);
  }

  @Get(':id/reactions/me')
  @UseGuards(OptionalJwtAuthGuard)
  reactionStatus(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const viewer = req.user as AuthUser | undefined;
    return this.socialService.reactionStatus(id, viewer?.id);
  }

  // Login required (parity with every other interaction) so the shareCount that
  // feeds the trending score can't be inflated by anonymous drip requests.
  @Post(':id/share')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  share(@Param('id', ParseIntPipe) id: number) {
    return this.socialService.share(id);
  }
}
