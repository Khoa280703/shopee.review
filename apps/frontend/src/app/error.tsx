'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errors');
  const common = useTranslations('common');
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-headline-md font-bold text-error">{t('genericTitle')}</h1>
      <p className="text-on-surface-variant">{t('tryAgainLater')}</p>
      <Button size="lg" onClick={reset}>
        {common('retry')}
      </Button>
    </div>
  );
}
