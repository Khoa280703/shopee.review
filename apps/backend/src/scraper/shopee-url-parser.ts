import { BadRequestException } from '@nestjs/common';

export interface ShopeeIds {
  shopId: string;
  itemId: string;
  originalUrl: string;
}

const SHOPEE_URL_REGEX = /-i\.(\d+)\.(\d+)/;
const SHOPEE_SHORT_LINK_REGEX = /^https?:\/\/(shope\.ee|s\.shopee\.vn)\//;
const SHOPEE_DOMAIN_REGEX = /^https?:\/\/(www\.)?shopee\.vn\//;

// SSRF guard: short-link resolution follows redirects, and s.shopee.vn is an
// OPEN REDIRECTOR (s.shopee.vn/an_redir?origin_link=<anywhere>). Following blindly
// (redirect:'follow') would let an attacker steer the server at internal hosts
// (169.254.169.254, localhost, private ranges). We follow MANUALLY and refuse to
// fetch any hop whose host is not an allowlisted Shopee host.
const ALLOWED_SHOPEE_HOSTS = new Set(['shopee.vn', 'www.shopee.vn', 'shope.ee', 's.shopee.vn']);
const MAX_REDIRECT_HOPS = 5;

function isAllowedShopeeHost(candidate: string): boolean {
  try {
    return ALLOWED_SHOPEE_HOSTS.has(new URL(candidate).hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function resolveShortLink(shortUrl: string): Promise<string> {
  let current = shortUrl;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    // Validate BEFORE each network call → a redirect target that is not a Shopee
    // host (internal IP, attacker domain) is rejected and never fetched.
    if (!isAllowedShopeeHost(current)) {
      throw new BadRequestException('Short link redirect tới host không hợp lệ');
    }
    const response = await fetch(current, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000), // a slow/hanging host must not stall the request
    });
    const location = response.headers.get('location');
    if (!location) return current; // no further redirect
    current = new URL(location, current).toString(); // resolve relative Location
  }
  throw new BadRequestException('Short link redirect quá nhiều lần');
}

export async function parseShopeeUrl(rawUrl: string): Promise<ShopeeIds> {
  let url = rawUrl.trim();
  if (!SHOPEE_DOMAIN_REGEX.test(url) && !SHOPEE_SHORT_LINK_REGEX.test(url)) {
    throw new BadRequestException('URL không phải Shopee link hợp lệ');
  }

  if (SHOPEE_SHORT_LINK_REGEX.test(url)) {
    url = await resolveShortLink(url);
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
    originalUrl: url.split('?')[0],
  };
}
