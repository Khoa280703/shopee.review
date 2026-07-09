import {
  Controller,
  Get,
  Header,
  type MessageEvent,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { parsePageParams } from '../common/parse-page-params';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.notificationsService.list(user.id, parsePageParams(cursor).cursor);
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.markRead(user.id, id);
  }

  // X-Accel-Buffering:no tells nginx not to buffer this response, so SSE events
  // flush immediately instead of being held; Cache-Control:no-cache prevents any
  // proxy from caching the stream.
  // SkipThrottle: a long-lived SSE connection must not count against the global
  // rate limiter (one open stream would otherwise exhaust the per-IP quota).
  @Sse('stream')
  @SkipThrottle()
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache')
  @UseGuards(JwtAuthGuard)
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.notificationsService.createStream(user.id);
  }
}
