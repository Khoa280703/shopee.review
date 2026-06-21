import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { StatsService } from './stats.service';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('posts/stats')
  postStats(@CurrentUser() user: AuthUser) {
    return this.statsService.getPostStats(user.id);
  }

  @Get('clicks/chart')
  clicksChart(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    const days = period === '30d' ? 30 : 7;
    return this.statsService.getClicksChart(user.id, days);
  }
}
