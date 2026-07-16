import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { parsePageParams } from '../common/parse-page-params';
import { FeedService } from './feed.service';

@Controller('feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  getFeed(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    // Clamp like every other paginated route: an unbounded `limit` is an OOM/DoS
    // vector and `NaN` (limit=abc) would reach Prisma as `take: NaN` → 500.
    const page = parsePageParams(cursor, limit, { def: 20, max: 50 });
    return this.feedService.getFeed(user.id, page.cursor, page.limit);
  }
}
