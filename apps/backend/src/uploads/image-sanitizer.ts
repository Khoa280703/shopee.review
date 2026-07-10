import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

// Re-encode uploaded images to STRIP metadata (EXIF can leak GPS coordinates,
// camera serials, timestamps) and bound dimensions (abuse / storage cost). sharp
// drops all metadata by default on output — we never call withMetadata(). rotate()
// bakes the EXIF orientation into pixels first so the image isn't left sideways.
const MAX_DIMENSION = 2048;
// Guard against decompression bombs: a small compressed file can decode to
// hundreds of MB of pixels. 2048*2048 leaves generous headroom over MAX_DIMENSION
// while capping worst-case memory. sharp throws if the input exceeds this.
const MAX_INPUT_PIXELS = 2048 * 2048 * 4;

export async function sanitizeImage(buffer: Buffer, sniffedMime: string): Promise<Buffer> {
  // Animated GIFs: re-encoding is fragile (frame/loop handling) and GIF does not
  // carry EXIF GPS, so pass through — but still REJECT oversized dimensions (the
  // resize cap can't apply to a passthrough) via a cheap metadata read.
  if (sniffedMime === 'image/gif') {
    const meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if ((meta.width ?? 0) > MAX_DIMENSION || (meta.pageHeight ?? meta.height ?? 0) > MAX_DIMENSION) {
      throw new BadRequestException(`Ảnh GIF vượt kích thước tối đa ${MAX_DIMENSION}px`);
    }
    return buffer;
  }

  const pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true });

  switch (sniffedMime) {
    case 'image/jpeg':
      return pipeline.jpeg({ quality: 82 }).toBuffer();
    case 'image/png':
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case 'image/webp':
      return pipeline.webp({ quality: 82 }).toBuffer();
    default:
      // Unknown type should never reach here (controller allowlists first).
      return buffer;
  }
}
