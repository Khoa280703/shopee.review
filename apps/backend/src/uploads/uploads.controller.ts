import {
  BadRequestException,
  Controller,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { sanitizeImage } from './image-sanitizer';
import { R2UploadService } from './r2-upload.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Sniffs the real image type from the file's magic bytes. The client-supplied
 * Content-Type (and thus ParseFilePipe's regex) is trivially spoofable — a
 * disguised SVG/HTML could otherwise pass MIME checks and enable stored XSS.
 */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF: "GIF87a" / "GIF89a"
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') {
    return 'image/gif';
  }
  // WEBP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly r2: R2UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpeg|jpg|png|webp|gif)$/ })
        .addMaxSizeValidator({ maxSize: MAX_FILE_SIZE })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WEBP, GIF');
    }
    // Defense in depth: the declared MIME is spoofable, so verify magic bytes.
    const sniffed = sniffImageType(file.buffer);
    if (!sniffed || !ALLOWED_MIME.includes(sniffed)) {
      throw new BadRequestException('Nội dung tệp không phải ảnh hợp lệ');
    }
    // Strip EXIF (GPS/PII) + bound dimensions by re-encoding from the sniffed
    // type; also normalizes the stored MIME/ext to the real content.
    file.buffer = await sanitizeImage(file.buffer, sniffed);
    file.mimetype = sniffed;
    const url = await this.r2.uploadImage(file);
    return { url };
  }
}
