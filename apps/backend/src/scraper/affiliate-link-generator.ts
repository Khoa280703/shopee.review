import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AffiliateLinkGenerator {
  constructor(private readonly configService: ConfigService) {}

  generate(productUrl: string, subId?: string): string {
    const affiliateId = this.configService.getOrThrow<string>('SHOPEE_AFFILIATE_ID');
    const params = new URLSearchParams({
      origin_link: productUrl,
      affiliate_id: affiliateId
    });
    if (subId) params.set('sub_id', subId);
    return `https://s.shopee.vn/an_redir?${params.toString()}`;
  }
}
