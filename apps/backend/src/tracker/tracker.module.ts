import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrackerController],
  providers: [TrackerService],
})
export class TrackerModule {}
