'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PostForm } from '@/components/forms/post-form';
import { useAuth } from '@/lib/auth-context';

export default function CreatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="py-16 text-center text-slate-500">Đang tải...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="mb-6 text-2xl font-bold">Tạo bài review</h1>
      <PostForm />
    </div>
  );
}
