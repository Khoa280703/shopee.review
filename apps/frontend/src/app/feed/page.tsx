'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { feedApi } from '@/lib/api';
import { PostGrid, PostGridSkeleton } from '@/components/post/post-grid';
import { useAuth } from '@/lib/auth-context';
import type { CursorPage, Post } from '@/types';

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState<CursorPage<Post> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
      return;
    }
    if (user) {
      feedApi.get().then(setPage).catch(() => setPage({ data: [], nextCursor: null }));
    }
  }, [user, loading, router]);

  async function loadMore() {
    if (!page?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await feedApi.get(page.nextCursor);
      setPage({ data: [...page.data, ...next.data], nextCursor: next.nextCursor });
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading || !page) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-bold">Bảng tin của bạn</h1>
        <PostGridSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-2xl font-bold">Bảng tin của bạn</h1>
      {page.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-400">
          Hãy theo dõi ai đó để xem bài review của họ tại đây.
        </div>
      ) : (
        <>
          <PostGrid posts={page.data} />
          {page.nextCursor !== null && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="h-10 rounded-md border border-slate-300 bg-white px-6 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
