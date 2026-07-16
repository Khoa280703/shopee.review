'use client';

import { useTranslations } from 'next-intl';
import type { ClickChart as ClickChartData } from '@/types';

export function ClickChart({ chart }: { chart: ClickChartData }) {
  const t = useTranslations('dashboard');
  const max = Math.max(1, ...chart.data.map((d) => d.clicks));

  if (chart.data.length === 0) {
    return <p className="py-8 text-center text-sm text-on-surface-variant">{t('noClickData')}</p>;
  }

  return (
    <div className="flex h-48 items-end gap-2">
      {chart.data.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-primary"
              style={{ height: `${(d.clicks / max) * 100}%` }}
              title={`${d.clicks} clicks`}
            />
          </div>
          <span className="text-[10px] text-on-surface-variant">{d.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
