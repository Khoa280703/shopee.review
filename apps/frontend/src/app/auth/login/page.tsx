'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { safeNext } from '@/lib/safe-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';

// Error codes the backend OAuth callback redirects here with (M5): a locked
// account, a Google-unverified email it refused to auto-link, an OAuth CSRF
// state mismatch, or any other provider-side failure.
const OAUTH_ERROR_KEYS = ['account_locked', 'oauth_unverified', 'oauth_state', 'oauth_failed'] as const;
type OAuthErrorKey = (typeof OAUTH_ERROR_KEYS)[number];

function isOAuthErrorKey(value: string | null): value is OAuthErrorKey {
  return value !== null && (OAUTH_ERROR_KEYS as readonly string[]).includes(value);
}

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Surface a `?error=` from the OAuth callback redirect (M5) instead of
  // silently dropping it — previously these query params were never read.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('error');
    if (isOAuthErrorKey(code)) {
      setError(t(`login.oauthErrors.${code}`));
    }
  }, [t]);

  // Where to go after login: the `?next=` set by the middleware (or by any
  // client-side prompt via `loginHref`), restricted to internal relative
  // paths so it can't be abused as an open redirect.
  function nextTarget(): string {
    if (typeof window === 'undefined') return '/';
    const next = new URLSearchParams(window.location.search).get('next');
    return safeNext(next, window.location.origin);
  }

  // OAuth is a full-page redirect (no SPA state survives it), so the `next`
  // target is relayed via sessionStorage instead of a server-side param —
  // read back by /auth/callback, same-origin only, re-validated there too.
  function storeReturnTo() {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('authReturnTo', nextTarget());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await authApi.login({ email, password });
      setUser(user);
      router.push(nextTarget());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">{t('login.title')}</h1>
        <form onSubmit={submit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('login.emailPlaceholder')}
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('login.passwordPlaceholder')}
            required
          />
          {error && <p className="text-body-sm text-error">{error}</p>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? t('login.submitLoading') : t('login.submit')}
          </Button>
        </form>

        <p className="mt-3 text-right text-body-sm">
          <Link href="/auth/forgot-password" className="text-primary underline underline-offset-2">
            {t('login.forgotPassword')}
          </Link>
        </p>

        <div className="my-4 flex items-center gap-3 text-label-caps text-on-surface-variant">
          <div className="h-px flex-1 bg-outline-variant" /> {t('common.or')} <div className="h-px flex-1 bg-outline-variant" />
        </div>

        <a
          href={authApi.googleUrl()}
          onClick={storeReturnTo}
          className={buttonClasses({ variant: 'outline', fullWidth: true, size: 'lg' })}
        >
          {t('login.google')}
        </a>

        <a
          href={authApi.facebookUrl()}
          onClick={storeReturnTo}
          className={`mt-2 ${buttonClasses({ variant: 'outline', fullWidth: true, size: 'lg' })}`}
        >
          {t('login.facebook')}
        </a>

        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          {t('login.noAccount')}{' '}
          <Link href="/auth/register" className="font-semibold text-primary underline underline-offset-2">
            {t('login.register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
