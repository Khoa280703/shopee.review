'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { setUser } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await authApi.register(form);
      setUser(user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">{t('register.title')}</h1>
        <form onSubmit={submit} className="space-y-4">
          <Input value={form.username} onChange={update('username')} placeholder={t('register.usernamePlaceholder')} required />
          <Input value={form.displayName} onChange={update('displayName')} placeholder={t('register.displayNamePlaceholder')} required />
          <Input type="email" value={form.email} onChange={update('email')} placeholder={t('register.emailPlaceholder')} required />
          <Input
            type="password"
            value={form.password}
            onChange={update('password')}
            placeholder={t('register.passwordPlaceholder')}
            required
            minLength={8}
          />
          {error && <p className="text-body-sm text-error">{error}</p>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? t('register.submitLoading') : t('register.submit')}
          </Button>
        </form>

        <p className="mt-4 text-center text-label-caps text-on-surface-variant">
          {t('register.verifyNotice')}
        </p>

        <div className="my-4 flex items-center gap-3 text-label-caps text-on-surface-variant">
          <div className="h-px flex-1 bg-outline-variant" /> {t('common.or')} <div className="h-px flex-1 bg-outline-variant" />
        </div>

        <a href={authApi.googleUrl()} className={buttonClasses({ variant: 'outline', fullWidth: true, size: 'lg' })}>
          {t('register.google')}
        </a>

        <a
          href={authApi.facebookUrl()}
          className={`mt-2 ${buttonClasses({ variant: 'outline', fullWidth: true, size: 'lg' })}`}
        >
          {t('register.facebook')}
        </a>

        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          {t('register.haveAccount')}{' '}
          <Link href="/auth/login" className="font-semibold text-primary underline underline-offset-2">
            {t('register.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
