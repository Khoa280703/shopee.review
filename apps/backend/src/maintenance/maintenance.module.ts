import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReconciliationService } from './reconciliation.service';
import { RetentionService } from './retention.service';

@Module({
  imports: [PrismaModule],
  providers: [ReconciliationService, RetentionService],
  exports: [ReconciliationService, RetentionService],
})
export class MaintenanceModule {}
