export interface ScrapedDealData {
  title: string | null;
  originalUrl: string;
  affiliateUrl: string;
  originalPrice: number | null;
  salePrice: number | null;
  discountPercent: number | null;
  images: string[];
  shopName: string | null;
  shopRating: number | null;
  soldCount: number | null;
  source: 'api' | 'browser' | 'manual';
  warnings: string[];
}
