import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { sniffImageType, UploadsController } from '../src/uploads/uploads.controller';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

// sanitizeImage() re-encodes via sharp, so the controller-level tests need a
// real, decodable image — not just the 12-byte magic-number fixtures the
// sniffer-only tests below use.
let realJpeg: Buffer;
let realPng: Buffer;
beforeAll(async () => {
  realJpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#123456' } })
    .jpeg()
    .toBuffer();
  realPng = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#654321' } })
    .png()
    .toBuffer();
});

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'a.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: JPEG_MAGIC,
    size: JPEG_MAGIC.length,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  } as Express.Multer.File;
}

describe('sniffImageType (magic-byte detection, not the spoofable Content-Type)', () => {
  it('detects JPEG from its FF D8 FF signature', () => {
    expect(sniffImageType(JPEG_MAGIC)).toBe('image/jpeg');
  });

  it('detects PNG from its 8-byte signature', () => {
    expect(sniffImageType(PNG_MAGIC)).toBe('image/png');
  });

  it('detects GIF87a/GIF89a', () => {
    expect(sniffImageType(Buffer.from('GIF89a' + '\0'.repeat(6)))).toBe('image/gif');
  });

  it('detects WEBP via the RIFF....WEBP container', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP'),
    ]);
    expect(sniffImageType(buf)).toBe('image/webp');
  });

  it('returns null for content that is not a recognized image (e.g. disguised SVG/HTML)', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="x"><script>alert(1)</script></svg>'))).toBeNull();
  });

  it('returns null for a buffer too short to contain any signature', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('UploadsController.uploadImage', () => {
  function makeController() {
    const r2 = { uploadImage: vi.fn().mockResolvedValue('https://cdn.example/posts/x.jpg') };
    const controller = new UploadsController(r2 as never);
    return { controller, r2 };
  }

  it('rejects a declared MIME type outside the allow-list', async () => {
    const { controller, r2 } = makeController();
    await expect(
      controller.uploadImage(makeFile({ mimetype: 'application/pdf' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(r2.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects non-image content even if the declared MIME is on the allow-list', async () => {
    const { controller, r2 } = makeController();
    const fakeImage = Buffer.from('<svg><script>alert(1)</script></svg>');
    await expect(
      controller.uploadImage(makeFile({ mimetype: 'image/png', buffer: fakeImage })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(r2.uploadImage).not.toHaveBeenCalled();
  });

  it('normalizes a mislabeled MIME to the sniffed real type instead of trusting the label', async () => {
    const { controller, r2 } = makeController();
    // Declares image/png but the bytes are a real JPEG — the real content wins
    // (both are on the allow-list, so this corrects the label rather than
    // rejecting, since the actual bytes are a genuine, safe image either way).
    const file = makeFile({ mimetype: 'image/png', buffer: realJpeg });
    await controller.uploadImage(file);
    expect(file.mimetype).toBe('image/jpeg');
    expect(r2.uploadImage).toHaveBeenCalledOnce();
  });

  it('accepts a genuine JPEG and uploads the sanitized buffer', async () => {
    const { controller, r2 } = makeController();
    const result = await controller.uploadImage(makeFile({ buffer: realJpeg }));
    expect(result).toEqual({ url: 'https://cdn.example/posts/x.jpg' });
    expect(r2.uploadImage).toHaveBeenCalledOnce();
  });

  it('accepts a genuine PNG', async () => {
    const { controller, r2 } = makeController();
    const result = await controller.uploadImage(
      makeFile({ mimetype: 'image/png', buffer: realPng }),
    );
    expect(result).toEqual({ url: 'https://cdn.example/posts/x.jpg' });
    expect(r2.uploadImage).toHaveBeenCalledOnce();
  });
});
