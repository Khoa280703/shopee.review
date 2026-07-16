'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ResetPasswordForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('reset.mismatchError'));
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reset.error'));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="text-body-md text-error">
        {t('reset.invalidToken')}
      </p>
    );
  }

  if (done) {
    return (
      <p className="text-body-md text-on-surface-variant">
        {t('reset.successMessage')}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('reset.newPasswordPlaceholder')}
        required
        minLength={8}
      />
      <Input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={t('reset.confirmPasswordPlaceholder')}
        required
        minLength={8}
      />
      {error && <p className="text-body-sm text-error">{error}</p>}
      <Button type="submit" fullWidth size="lg" disabled={loading}>
        {loading ? t('reset.submitLoading') : t('reset.submit')}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">
          {t('reset.title')}
        </h1>
        <Suspense fallback={<p className="text-body-md text-on-surface-variant">{t('common.loadingEllipsis')}</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          <Link href="/auth/login" className="font-semibold text-primary underline underline-offset-2">
            {t('common.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
