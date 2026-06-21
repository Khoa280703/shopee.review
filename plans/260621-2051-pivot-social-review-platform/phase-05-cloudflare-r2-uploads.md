# Phase 05: Image Upload (Cloudflare R2)

**Links:** [Plan Overview](plan.md) | [Phase 04](phase-04-posts-scraper.md)  
**Depends on:** Phase 04

## Overview
- **Priority:** High
- **Status:** Pending
- **Effort:** ~0.5 ngày

Thay thế local upload bằng Cloudflare R2. User upload ảnh review → lưu vào R2 → URL trả về để gắn vào post.

## Cloudflare R2 Setup (Manual)
1. Tạo Cloudflare account → R2 Object Storage → Create bucket `shopee-review-uploads`
2. Enable public access (hoặc dùng Custom Domain)
3. Tạo API token với `Object Read & Write` permission
4. Ghi lại: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

R2 tương thích S3 API → dùng `@aws-sdk/client-s3` (đã quen, không cần SDK riêng).

## Backend: UploadsModule (Rewrite)

### Files to Create
```
apps/backend/src/uploads/
├── uploads.module.ts
├── uploads.controller.ts    (POST /uploads/image — JWT required)
└── r2-upload.service.ts     (thay thế local-upload.service.ts)
```

### r2-upload.service.ts
```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

@Injectable()
export class R2UploadService {
  private s3: S3Client;

  constructor(private config: ConfigService) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.get('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.get('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    const ext = file.mimetype.split('/')[1];  // jpg, png, webp
    const key = `posts/${randomUUID()}.${ext}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.config.get('R2_BUCKET_NAME'),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000',
    }));

    return `${this.config.get('R2_PUBLIC_URL')}/${key}`;
  }
}
```

### uploads.controller.ts
```typescript
@Post('image')
@UseGuards(JwtAuthGuard)
@UseInterceptors(FileInterceptor('file'))
async uploadImage(@UploadedFile() file: Express.Multer.File) {
  // Validate: max 5MB, only image/jpeg, image/png, image/webp
  const url = await this.r2UploadService.uploadImage(file);
  return { url };
}
```

**Validation:** `FileInterceptor` với `limits: { fileSize: 5 * 1024 * 1024 }` + check `mimetype`.

## Frontend: Image Upload Component

### Files to Create/Update
```
apps/frontend/src/components/
└── image-uploader.tsx        (drag-drop + preview + upload to /api/uploads/image)
```

**image-uploader.tsx** — Behavior:
- Drag & drop hoặc click to select
- Preview thumbnail ngay sau khi chọn
- Upload lên `/api/uploads/image` → nhận `{ url }`
- Trả URL về parent component (PostForm)
- Max 10 ảnh per post
- Show upload progress

## Dependencies (mới)
```bash
# Backend
pnpm --filter @app/backend add @aws-sdk/client-s3

# Frontend (optional — nếu cần presigned URLs sau)
# không cần cho MVP
```

## Environment Variables (mới)
```env
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=shopee-review-uploads
R2_PUBLIC_URL=https://pub-xxx.r2.dev  # hoặc custom domain
```

## CORS cho R2 Bucket
Cần config CORS trong R2 dashboard:
```json
[{
  "AllowedOrigins": ["https://shopee.review"],
  "AllowedMethods": ["GET"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```
(Upload đi qua backend API, nên chỉ cần GET cors cho public images)

## Todo
- [ ] Setup Cloudflare R2 bucket (manual step)
- [ ] Install `@aws-sdk/client-s3` 
- [ ] Implement `R2UploadService`
- [ ] Implement `UploadsController` với validation
- [ ] Update `.env.example` với R2 vars
- [ ] Frontend: `ImageUploader` component
- [ ] Wire vào `PostForm` (phase 04)
- [ ] Test: upload ảnh thành công, URL accessible

## Success Criteria
- Upload ảnh → URL R2 public accessible
- File validation chặn file > 5MB và không phải image
- Ảnh hiển thị trong post sau khi tạo
- Không còn sử dụng local `uploads/` directory
