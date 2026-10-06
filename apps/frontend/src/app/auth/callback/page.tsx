'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { safeNext } from '@/lib/safe-next';

export default function AuthCallbackPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { refresh } = useAuth();

  useEffect(() => {
    refresh().finally(() => {
      // Relayed by the login/register page before the full-page OAuth
      // redirect (no SPA state survives it) — re-validated here the same way
      // as the password-login `?next=` so it can't become an open redirect.
      const stored = sessionStorage.getItem('authReturnTo');
      sessionStorage.removeItem('authReturnTo');
      router.replace(safeNext(stored, window.location.origin));
    });
  }, [refresh, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-on-surface-variant">
      {t('callback.loading')}
    </div>
  );
}
