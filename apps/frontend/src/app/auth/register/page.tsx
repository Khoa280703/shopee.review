'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
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
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-6 text-2xl font-bold">Đăng ký</h1>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={form.username}
          onChange={update('username')}
          placeholder="Username (a-z, 0-9, _)"
          required
          className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
        />
        <input
          value={form.displayName}
          onChange={update('displayName')}
          placeholder="Tên hiển thị"
          required
          className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
        />
        <input
          type="email"
          value={form.email}
          onChange={update('email')}
          placeholder="Email"
          required
          className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
        />
        <input
          type="password"
          value={form.password}
          onChange={update('password')}
          placeholder="Mật khẩu (tối thiểu 8 ký tự)"
          required
          minLength={8}
          className="h-11 w-full rounded-lg border border-slate-300 px-4 text-sm outline-none focus:border-orange-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-400">
        Sau khi đăng ký, kiểm tra email để xác minh trước khi đăng bài.
      </p>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" /> hoặc <div className="h-px flex-1 bg-slate-200" />
      </div>

      <a
        href={authApi.googleUrl()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50"
      >
        Đăng ký với Google
      </a>

      <p className="mt-6 text-center text-sm text-slate-500">
        Đã có tài khoản?{' '}
        <Link href="/auth/login" className="font-medium text-orange-600 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
