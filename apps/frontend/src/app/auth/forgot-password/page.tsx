'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      // Always show success (server never reveals whether the email exists).
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">
          Quên mật khẩu
        </h1>

        {sent ? (
          <p className="text-body-md text-on-surface-variant">
            Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-body-sm text-on-surface-variant">
              Nhập email của bạn, chúng tôi sẽ gửi link đặt lại mật khẩu.
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
            />
            <Button type="submit" fullWidth size="lg" disabled={loading}>
              {loading ? 'Đang gửi...' : 'Gửi link đặt lại'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-body-sm text-on-surface-variant">
          <Link href="/auth/login" className="font-semibold text-primary underline underline-offset-2">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
