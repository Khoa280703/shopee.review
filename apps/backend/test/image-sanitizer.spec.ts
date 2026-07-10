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

  it('passes a within-limits GIF through untouched (avoids fragile animated re-encode)', async () => {
    const gif = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#fff' } })
      .gif()
      .toBuffer();
    expect(await sanitizeImage(gif, 'image/gif')).toBe(gif);
  });

  it('rejects an oversized GIF (cap cannot resize a passthrough)', async () => {
    const bigGif = await sharp({ create: { width: 3000, height: 100, channels: 4, background: '#fff' } })
      .gif()
      .toBuffer();
    await expect(sanitizeImage(bigGif, 'image/gif')).rejects.toThrow();
  });
});
