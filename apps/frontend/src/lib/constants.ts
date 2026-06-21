export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3066/api';
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL || API_URL;
export const API_ASSET_ORIGIN = API_URL.replace(/\/api\/?$/, '');
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
