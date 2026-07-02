import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AffiliateLinkGenerator {
  constructor(private readonly configService: ConfigService) {}

  generate(productUrl: string, subId?: string): string {
    // Optional: the scraped affiliate URL is only a pre-fill suggestion — users
    // paste their own affiliate link to earn commission. Without a platform
    // affiliate id, degrade to the plain product URL instead of throwing (which
    // previously crashed the whole scrape in Docker where the env is unset).
    const affiliateId = this.configService.get<string>('SHOPEE_AFFILIATE_ID');
    if (!affiliateId) {
      return productUrl;
    }
    const params = new URLSearchParams({
      origin_link: productUrl,
      affiliate_id: affiliateId
    });
    if (subId) params.set('sub_id', subId);
    return `https://s.shopee.vn/an_redir?${params.toString()}`;
  }
}
