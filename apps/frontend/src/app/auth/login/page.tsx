'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Where to go after login: the `?next=` set by the middleware, restricted to
  // internal absolute paths so it can't be abused as an open redirect.
  function nextTarget(): string {
    if (typeof window === 'undefined') return '/';
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
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
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">Đăng nhập</h1>
        <form onSubmit={submit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
            required
          />
          {error && <p className="text-body-sm text-error">{error}</p>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>

        <p className="mt-3 text-right text-body-sm">
          <Link href="/auth/forgot-password" className="text-primary underline underline-offset-2">
            Quên mật khẩu?
          </Link>
        </p>

        <div className="my-4 flex items-center gap-3 text-label-caps text-on-surface-variant">
          <div className="h-px flex-1 bg-outline-variant" /> hoặc <div className="h-px flex-1 bg-outline-variant" />
        </div>

        <a href={authApi.googleUrl()} className={buttonClasses({ variant: 'outline', fullWidth: true, size: 'lg' })}>
          Đăng nhập với Google
        </a>

        <a
          href={authApi.facebookUrl()}
          className={`mt-2 ${buttonClasses({ variant: 'outline', fullWidth: true, size: 'lg' })}`}
        >
          Đăng nhập với Facebook
        </a>

        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          Chưa có tài khoản?{' '}
          <Link href="/auth/register" className="font-semibold text-primary underline underline-offset-2">
            Đăng ký
          </Link>
        </p>
      </div>
    </div>
  );
}
