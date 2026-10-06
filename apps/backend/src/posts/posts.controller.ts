import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthUser } from '../common/current-user.decorator';
import { QueryPostsDto } from './dto/query-posts.dto';
import { PostsService } from './posts.service';

class ExploreQueryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;
}

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() query: QueryPostsDto, @Req() req: Request) {
    const viewer = req.user as AuthUser | undefined;
    return this.postsService.findAll(query, viewer?.id);
  }

  @Get('explore')
  @UseGuards(OptionalJwtAuthGuard)
  findExplore(@Query() query: ExploreQueryDto, @Req() req: Request) {
    const viewer = req.user as AuthUser | undefined;
    return this.postsService.findExplore(
      query.offset ?? 0,
      query.limit ?? 20,
      query.categoryId,
      viewer?.id,
    );
  }

  @Get('trending')
  getTrending() {
    return this.postsService.getTrending();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.postsService.findOne(id);
  }
}
