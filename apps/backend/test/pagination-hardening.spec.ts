import { describe, expect, it } from 'vitest';
import { parsePageParams } from '../src/common/parse-page-params';
import { isInternalRequest } from '../src/common/smart-throttler.guard';

describe('isInternalRequest (throttler SSR exemption)', () => {
  it('treats a request without X-Forwarded-For as internal (skip throttle)', () => {
    expect(isInternalRequest({})).toBe(true);
    expect(isInternalRequest(undefined)).toBe(true);
  });

  it('treats a proxied request (has X-Forwarded-For) as external (throttle)', () => {
    expect(isInternalRequest({ 'x-forwarded-for': '203.0.113.5' })).toBe(false);
    expect(isInternalRequest({ 'x-forwarded-for': '10.0.0.1, 203.0.113.5' })).toBe(false);
  });
});

describe('parsePageParams', () => {
  it('defaults when params absent', () => {
    expect(parsePageParams(undefined, undefined)).toEqual({ cursor: undefined, limit: 20 });
    expect(parsePageParams(undefined, undefined, { def: 10 })).toEqual({
      cursor: undefined,
      limit: 10,
    });
  });

  it('clamps oversized limit to max (blocks unbounded-scan DoS)', () => {
    expect(parsePageParams(undefined, '1000000').limit).toBe(50);
    expect(parsePageParams(undefined, '1000000', { max: 100 }).limit).toBe(100);
  });

  it('falls back to def on invalid / non-positive limit', () => {
    expect(parsePageParams(undefined, 'abc').limit).toBe(20);
    expect(parsePageParams(undefined, '0').limit).toBe(20);
    expect(parsePageParams(undefined, '-5').limit).toBe(20);
    expect(parsePageParams(undefined, '3.9').limit).toBe(3); // floored
  });

  it('coerces invalid cursor to undefined (prevents NaN → Postgres 500)', () => {
    expect(parsePageParams('abc').cursor).toBeUndefined();
    expect(parsePageParams('0').cursor).toBeUndefined();
    expect(parsePageParams('-1').cursor).toBeUndefined();
    expect(parsePageParams('1.5').cursor).toBeUndefined();
  });

  it('passes through a valid positive integer cursor', () => {
    expect(parsePageParams('42').cursor).toBe(42);
  });
});
