import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
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
  findAll(@Query() query: QueryPostsDto) {
    return this.postsService.findAll(query);
  }

  @Get('explore')
  findExplore(@Query() query: ExploreQueryDto) {
    return this.postsService.findExplore(
      query.offset ?? 0,
      query.limit ?? 20,
      query.categoryId,
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
