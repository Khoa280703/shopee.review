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
    return <div className="py-16 text-center text-on-surface-variant">Đang tải...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-lg">
      <h1 className="mb-6 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface">Tạo bài review</h1>
      <PostForm />
    </div>
  );
}
