import sharp from 'sharp';

// Re-encode uploaded images to STRIP metadata (EXIF can leak GPS coordinates,
// camera serials, timestamps) and bound dimensions (abuse / storage cost). sharp
// drops all metadata by default on output — we never call withMetadata(). rotate()
// bakes the EXIF orientation into pixels first so the image isn't left sideways.
const MAX_DIMENSION = 2048;

export async function sanitizeImage(buffer: Buffer, sniffedMime: string): Promise<Buffer> {
  // Animated GIFs: re-encoding is fragile (frame/loop handling) and GIF does not
  // carry EXIF GPS, so pass through untouched.
  if (sniffedMime === 'image/gif') return buffer;

  const pipeline = sharp(buffer)
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
