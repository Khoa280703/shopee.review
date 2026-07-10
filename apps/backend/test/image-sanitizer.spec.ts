import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sanitizeImage } from '../src/uploads/image-sanitizer';

// Build a JPEG that carries EXIF metadata (orientation + a description tag).
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 60, channels: 3, background: '#123456' } })
    .withExif({ IFD0: { ImageDescription: 'secret-location-data' } })
    .jpeg()
    .toBuffer();
}

describe('sanitizeImage', () => {
  it('strips EXIF metadata from a JPEG', async () => {
    const withExif = await jpegWithExif();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const cleaned = await sanitizeImage(withExif, 'image/jpeg');
    const meta = await sharp(cleaned).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
  });

  it('caps oversized dimensions to the max, keeping aspect ratio', async () => {
    const big = await sharp({ create: { width: 5000, height: 2500, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const cleaned = await sanitizeImage(big, 'image/png');
    const meta = await sharp(cleaned).metadata();
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(1024);
  });

  it('passes GIF through untouched (avoids fragile animated re-encode)', async () => {
    const gif = Buffer.from('GIF89a-fake', 'ascii');
    expect(await sanitizeImage(gif, 'image/gif')).toBe(gif);
  });
});
