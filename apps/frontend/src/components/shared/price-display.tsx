import { formatPrice } from '@/lib/format';

interface Props {
  original: number;
  sale: number;
  discountPercent: number;
  size?: 'sm' | 'lg';
}

export function PriceDisplay({ original, sale, discountPercent, size = 'sm' }: Props) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={size === 'lg' ? 'text-2xl font-bold text-red-600' : 'text-lg font-bold text-red-600'}>{formatPrice(sale)}</span>
      {original > sale && <span className="text-sm text-slate-400 line-through">{formatPrice(original)}</span>}
      {discountPercent > 0 && <span className="text-xs font-semibold text-red-500">-{discountPercent}%</span>}
    </div>
  );
}
