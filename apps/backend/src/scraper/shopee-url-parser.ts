import { BadRequestException } from '@nestjs/common';

export interface ShopeeIds {
  shopId: string;
  itemId: string;
  originalUrl: string;
}

const SHOPEE_URL_REGEX = /-i\.(\d+)\.(\d+)/;
const SHOPEE_SHORT_LINK_REGEX = /^https?:\/\/(shope\.ee|s\.shopee\.vn)\//;
const SHOPEE_DOMAIN_REGEX = /^https?:\/\/(www\.)?shopee\.vn\//;

export async function parseShopeeUrl(rawUrl: string): Promise<ShopeeIds> {
  let url = rawUrl.trim();
  if (!SHOPEE_DOMAIN_REGEX.test(url) && !SHOPEE_SHORT_LINK_REGEX.test(url)) {
    throw new BadRequestException('URL không phải Shopee link hợp lệ');
  }

  if (SHOPEE_SHORT_LINK_REGEX.test(url)) {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    url = response.url;
    if (!SHOPEE_DOMAIN_REGEX.test(url)) {
      throw new BadRequestException('Short link không redirect về Shopee hợp lệ');
    }
  }

  const match = url.match(SHOPEE_URL_REGEX);
  if (!match) {
    throw new BadRequestException('Không tìm thấy shopId/itemId trong URL');
  }

  return {
    shopId: match[1],
    itemId: match[2],
    originalUrl: url.split('?')[0]
  };
}
