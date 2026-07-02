import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { R2UploadService } from './r2-upload.service';

@Module({
  controllers: [UploadsController],
  providers: [R2UploadService],
  exports: [R2UploadService],
})
export class UploadsModule {}
