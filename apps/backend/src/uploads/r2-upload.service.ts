import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class R2UploadService {
  private readonly logger = new Logger(R2UploadService.name);
  private readonly s3: S3Client | null;
  private readonly bucket?: string;
  private readonly publicUrl?: string;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('R2_BUCKET_NAME');
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL');

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.s3 = null;
      this.logger.warn('Cloudflare R2 chưa cấu hình — upload sẽ bị từ chối');
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    if (!this.s3 || !this.bucket || !this.publicUrl) {
      throw new InternalServerErrorException('Dịch vụ upload chưa được cấu hình');
    }

    const ext = EXT_BY_MIME[file.mimetype] ?? 'bin';
    const key = `posts/${randomUUID()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000',
      }),
    );

    return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}
