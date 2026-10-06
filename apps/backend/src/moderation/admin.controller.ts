import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum } from 'class-validator';
import { ReportStatus } from '@app/database';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { parsePageParams } from '../common/parse-page-params';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { DeleteReasonDto } from './dto/delete-reason.dto';

class ResolveReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;
}

class SetVerifiedDto {
  @IsBoolean()
  verified!: boolean;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  listReports(@Query('status') status?: ReportStatus) {
    return this.admin.listReports(status);
  }

  @Get('audit')
  listAudit(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = parsePageParams(cursor, limit, { def: 50, max: 100 });
    return this.admin.listAudit(page.limit, page.cursor);
  }

  @Get('posts/deleted')
  listDeletedPosts(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = parsePageParams(cursor, limit, { def: 20, max: 50 });
    return this.admin.listDeletedPosts(page.limit, page.cursor);
  }

  @Get('comments/deleted')
  listDeletedComments(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = parsePageParams(cursor, limit, { def: 20, max: 50 });
    return this.admin.listDeletedComments(page.limit, page.cursor);
  }

  @Get('users/locked')
  listLockedUsers(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = parsePageParams(cursor, limit, { def: 20, max: 50 });
    return this.admin.listLockedUsers(page.limit, page.cursor);
  }

  @Patch('reports/:id')
  resolveReport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveReportDto,
  ) {
    return this.admin.resolveReport(id, dto.status, user.id);
  }

  @Delete('posts/:id')
  deletePost(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteReasonDto,
  ) {
    return this.admin.deletePost(user.id, id, dto?.reason);
  }

  @Post('posts/:id/restore')
  restorePost(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.restorePost(user.id, id);
  }

  @Delete('comments/:id')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteReasonDto,
  ) {
    return this.admin.deleteComment(user.id, id, dto?.reason);
  }

  @Post('comments/:id/restore')
  restoreComment(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.restoreComment(user.id, id);
  }

  @Post('users/:id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.suspend(user.id, id);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.unsuspend(user.id, id);
  }

  @Post('users/:id/ban')
  ban(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.ban(user.id, id);
  }

  @Post('users/:id/unban')
  unban(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.unban(user.id, id);
  }

  @Patch('users/:id/verified')
  setVerified(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetVerifiedDto,
  ) {
    return this.admin.setVerified(user.id, id, dto.verified);
  }
}
