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
import { IsEnum } from 'class-validator';
import { ReportStatus } from '@app/database';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { parsePageParams } from '../common/parse-page-params';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class ResolveReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;
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

  @Patch('reports/:id')
  resolveReport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveReportDto,
  ) {
    return this.admin.resolveReport(id, dto.status, user.id);
  }

  @Delete('posts/:id')
  deletePost(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.deletePost(user.id, id);
  }

  @Delete('comments/:id')
  deleteComment(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteComment(user.id, id);
  }

  @Post('users/:id/ban')
  ban(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.ban(user.id, id);
  }

  @Post('users/:id/unban')
  unban(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.unban(user.id, id);
  }
}
