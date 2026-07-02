import { formatPrice } from '@/lib/format';

interface Props {
  original: number;
  sale: number;
  discountPercent: number;
  size?: 'sm' | 'lg';
}

export function PriceDisplay({ original, sale, discountPercent, size = 'sm' }: Props) {
  return (
    <div className="flex flex-wrap items-baseline gap-sm">
      <span className={size === 'lg' ? 'font-price-lg text-display-lg-mobile font-bold text-primary' : 'font-price-lg text-headline-md font-bold text-primary'}>{formatPrice(sale)}</span>
      {original > sale && <span className="font-body-sm text-body-sm text-on-surface-variant line-through">{formatPrice(original)}</span>}
      {discountPercent > 0 && <span className="font-label-caps text-label-caps font-semibold text-primary">-{discountPercent}%</span>}
    </div>
  );
}
