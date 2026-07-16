import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonClasses } from '@/components/ui/button-classes';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-display-lg font-bold text-primary">404</h1>
      <p className="text-on-surface-variant">{t('notFoundMessage')}</p>
      <Link href="/" className={buttonClasses({ size: 'lg' })}>
        {t('backHome')}
      </Link>
    </div>
  );
}
