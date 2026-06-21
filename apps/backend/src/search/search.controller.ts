import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query('q') q: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
  ) {
    const searchType = type === 'posts' || type === 'users' ? type : 'all';
    return this.searchService.search(q ?? '', searchType, page ? Number(page) : 1);
  }
}
