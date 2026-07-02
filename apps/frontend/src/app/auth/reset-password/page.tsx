'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ResetPasswordForm() {
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
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đặt lại mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="text-body-md text-error">
        Link không hợp lệ. Vui lòng yêu cầu đặt lại mật khẩu mới.
      </p>
    );
  }

  if (done) {
    return (
      <p className="text-body-md text-on-surface-variant">
        Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mật khẩu mới"
        required
        minLength={8}
      />
      <Input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Xác nhận mật khẩu"
        required
        minLength={8}
      />
      {error && <p className="text-body-sm text-error">{error}</p>}
      <Button type="submit" fullWidth size="lg" disabled={loading}>
        {loading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">
          Đặt lại mật khẩu
        </h1>
        <Suspense fallback={<p className="text-body-md text-on-surface-variant">Đang tải...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          <Link href="/auth/login" className="font-semibold text-primary underline underline-offset-2">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
