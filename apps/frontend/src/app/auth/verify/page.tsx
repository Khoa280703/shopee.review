'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { buttonClasses } from '@/components/ui/button-classes';

function VerifyInner() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const token = params.get('token');
  const { refresh, user } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [resent, setResent] = useState(false);

  const resend = () => {
    if (!user?.email) return;
    authApi.resendVerification(user.email).finally(() => setResent(true));
  };

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    authApi
      .verify(token)
      .then(() => {
        setStatus('ok');
        void refresh();
      })
      .catch(() => setStatus('error'));
  }, [token, refresh]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {status === 'loading' && <p className="text-on-surface-variant">{t('verify.verifying')}</p>}
      {status === 'ok' && (
        <div className="space-y-4">
          <h1 className="text-headline-md font-bold text-tertiary">{t('verify.successTitle')}</h1>
          <p className="text-on-surface-variant">{t('verify.successMessage')}</p>
          <Link href="/create" className={buttonClasses({ size: 'lg' })}>
            {t('verify.postNow')}
          </Link>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-4">
          <h1 className="text-headline-md font-bold text-error">{t('verify.errorTitle')}</h1>
          <p className="text-on-surface-variant">{t('verify.errorMessage')}</p>
          {user?.email &&
            (resent ? (
              <p className="text-body-sm text-tertiary">
                {t('verify.resentMessage')}
              </p>
            ) : (
              <button onClick={resend} className={buttonClasses({ size: 'lg' })}>
                {t('verify.resendButton')}
              </button>
            ))}
          <Link href="/" className={buttonClasses({ variant: 'outline', size: 'lg' })}>
            {t('verify.homeButton')}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  const t = useTranslations('auth');
  return (
    <Suspense fallback={<div className="py-16 text-center text-on-surface-variant">{t('common.loadingEllipsis')}</div>}>
      <VerifyInner />
    </Suspense>
  );
}
