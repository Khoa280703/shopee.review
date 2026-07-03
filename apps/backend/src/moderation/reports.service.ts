import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus, ReportTargetType } from '@app/database';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * File a report. Returns an identical response whether or not the target
   * exists/is visible — never leaks existence (no enumeration oracle). The row
   * is only persisted when the target genuinely exists; a bad target is silently
   * ignored. Idempotent via the @@unique(reporter, targetType, targetId).
   */
  async create(reporterId: number, dto: CreateReportDto): Promise<{ success: boolean }> {
    const exists = await this.targetExists(dto.targetType, dto.targetId);
    if (exists) {
      try {
        await this.prisma.report.create({
          data: {
            reporterId,
            targetType: dto.targetType,
            targetId: dto.targetId,
            reason: dto.reason,
            detail: dto.detail,
          },
        });
      } catch (e) {
        // Duplicate report → idempotent no-op.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
          throw e;
        }
      }
    }
    return { success: true };
  }

  private async targetExists(type: ReportTargetType, id: number): Promise<boolean> {
    switch (type) {
      case ReportTargetType.POST:
        return Boolean(await this.prisma.post.findUnique({ where: { id }, select: { id: true } }));
      case ReportTargetType.COMMENT:
        return Boolean(await this.prisma.comment.findUnique({ where: { id }, select: { id: true } }));
      case ReportTargetType.USER:
        return Boolean(await this.prisma.user.findUnique({ where: { id }, select: { id: true } }));
      default:
        return false;
    }
  }

  list(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : {},
      include: { reporter: { select: { username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolve(id: number, status: ReportStatus, adminId: number) {
    try {
      await this.prisma.report.update({
        where: { id },
        data: { status, resolvedBy: adminId },
      });
    } catch (e) {
      // Missing report id → 404 instead of an unhandled 500.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy báo cáo');
      }
      throw e;
    }
    return { success: true };
  }
}
