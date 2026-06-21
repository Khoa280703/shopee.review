'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const { refresh } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

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
      {status === 'loading' && <p className="text-slate-500">Đang xác minh email...</p>}
      {status === 'ok' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-green-600">Xác minh thành công!</h1>
          <p className="text-slate-500">Bạn đã có thể đăng bài review.</p>
          <Link href="/create" className="inline-flex rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white">
            Đăng bài ngay
          </Link>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Xác minh thất bại</h1>
          <p className="text-slate-500">Link không hợp lệ hoặc đã hết hạn.</p>
          <Link href="/" className="inline-flex rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium">
            Về trang chủ
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-slate-500">Đang tải...</div>}>
      <VerifyInner />
    </Suspense>
  );
}
