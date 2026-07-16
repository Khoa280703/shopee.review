import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../moderation/admin.guard';
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

  /** Admin-only: rebuild the Meilisearch index from Postgres (drift recovery). */
  @Post('reindex')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async reindex() {
    const indexed = await this.searchService.reindexAll();
    return { success: true, indexed };
  }
}
