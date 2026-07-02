'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { buttonClasses } from '@/components/ui/button-classes';

function VerifyInner() {
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
      {status === 'loading' && <p className="text-on-surface-variant">Đang xác minh email...</p>}
      {status === 'ok' && (
        <div className="space-y-4">
          <h1 className="text-headline-md font-bold text-tertiary">Xác minh thành công!</h1>
          <p className="text-on-surface-variant">Bạn đã có thể đăng bài review.</p>
          <Link href="/create" className={buttonClasses({ size: 'lg' })}>
            Đăng bài ngay
          </Link>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-4">
          <h1 className="text-headline-md font-bold text-error">Xác minh thất bại</h1>
          <p className="text-on-surface-variant">Link không hợp lệ hoặc đã hết hạn.</p>
          {user?.email &&
            (resent ? (
              <p className="text-body-sm text-tertiary">
                Đã gửi lại email xác minh (nếu tài khoản chưa xác minh). Kiểm tra hộp thư.
              </p>
            ) : (
              <button onClick={resend} className={buttonClasses({ size: 'lg' })}>
                Gửi lại email xác minh
              </button>
            ))}
          <Link href="/" className={buttonClasses({ variant: 'outline', size: 'lg' })}>
            Về trang chủ
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-on-surface-variant">Đang tải...</div>}>
      <VerifyInner />
    </Suspense>
  );
}
