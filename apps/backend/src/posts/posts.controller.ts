import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { QueryPostsDto } from './dto/query-posts.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(@Query() query: QueryPostsDto) {
    return this.postsService.findAll(query);
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
