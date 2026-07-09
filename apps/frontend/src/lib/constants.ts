// Browser → API is SAME-ORIGIN and RELATIVE: nginx fronts /api, /uploads, /r,
// /socket.io in prod; the Next dev rewrite (next.config.ts) proxies them in dev.
// A relative base means ONE build runs on any host/port — no NEXT_PUBLIC_API_URL
// baked at image-build time (the source of the port-80 breakage).
export const API_URL = '/api';
// SSR runs server-side and must reach the backend directly with an ABSOLUTE URL
// (the browser origin is meaningless there). Defaults to host-dev localhost.
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:3066/api';
// Assets (/uploads, /r) are same-origin → relative base (empty prefix).
export const API_ASSET_ORIGIN = '';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://shopee.review';
export const SITE_NAME = 'shopee.review';
export const SITE_DESCRIPTION =
  'Mạng xã hội review sản phẩm Shopee - chia sẻ đánh giá thật, kiếm thu nhập từ affiliate';

export function resolveAssetUrl(url: string | null | undefined) {
  if (!url) return undefined;
  if (url.startsWith('/uploads/')) return `${API_ASSET_ORIGIN}${url}`;
  return url;
}

export function clickRedirectUrl(postId: number) {
  return `${API_ASSET_ORIGIN}/r/${postId}`;
}
