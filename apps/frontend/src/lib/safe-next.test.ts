import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

const ORIGIN = 'https://shopee.review';

describe('safeNext (H1 — open redirect)', () => {
  it('accepts a plain same-origin relative path', () => {
    expect(safeNext('/profile/me', ORIGIN)).toBe('/profile/me');
  });

  it('preserves query string and hash', () => {
    expect(safeNext('/search?q=abc#top', ORIGIN)).toBe('/search?q=abc#top');
  });

  it('falls back to / for null/undefined/empty input', () => {
    expect(safeNext(null, ORIGIN)).toBe('/');
    expect(safeNext(undefined, ORIGIN)).toBe('/');
    expect(safeNext('', ORIGIN)).toBe('/');
  });

  it('rejects a protocol-relative redirect', () => {
    expect(safeNext('//evil.com', ORIGIN)).toBe('/');
  });

  it('rejects a full URL to a different origin', () => {
    expect(safeNext('https://evil.com', ORIGIN)).toBe('/');
    expect(safeNext('http://evil.com/path', ORIGIN)).toBe('/');
  });

  // The actual bypass this review finding (H1) exists for: the old
  // `startsWith('/') && !startsWith('//')` check passed both of these, but
  // browsers normalize a leading backslash to `/` for special schemes, so
  // they resolve to a different origin anyway.
  it('rejects a leading-backslash bypass', () => {
    expect(safeNext('/\\evil.com', ORIGIN)).toBe('/');
    expect(safeNext('/\\t/evil.com', ORIGIN)).toBe('/');
  });

  it('rejects embedded control characters', () => {
    expect(safeNext('/ok\x00path', ORIGIN)).toBe('/');
    expect(safeNext('/ok\npath', ORIGIN)).toBe('/');
  });

  it('rejects a bare backslash anywhere in the input', () => {
    expect(safeNext('/a\\b', ORIGIN)).toBe('/');
  });
});
