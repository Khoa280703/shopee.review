'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  useEffect(() => {
    refresh().finally(() => router.replace('/'));
  }, [refresh, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
      Đang đăng nhập...
    </div>
  );
}
