'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';

export default function AuthCallbackPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { refresh } = useAuth();

  useEffect(() => {
    refresh().finally(() => router.replace('/'));
  }, [refresh, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-on-surface-variant">
      {t('callback.loading')}
    </div>
  );
}
