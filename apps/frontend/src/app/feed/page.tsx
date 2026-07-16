'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { feedApi } from '@/lib/api';
import { PostFeed, PostFeedSkeleton } from '@/components/post/post-grid';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import type { CursorPage, Post } from '@/types';

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState<CursorPage<Post> | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
      return;
    }
    if (user) {
      setFailed(false);
      // Distinguish a real load failure from a genuinely empty feed — otherwise a
      // backend error reads as "follow someone", which is misleading.
      feedApi
        .get()
        .then(setPage)
        .catch(() => {
          setFailed(true);
          setPage({ data: [], nextCursor: null });
        });
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
      <div className="mx-auto w-full max-w-[640px] px-0 py-md sm:px-4 lg:px-lg">
        <h1 className="mb-4 font-headline-md text-headline-md font-bold text-on-surface">Bảng tin</h1>
        <PostFeedSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-0 py-md sm:px-4 lg:px-lg">
      <h1 className="mb-4 px-4 font-headline-md text-headline-md font-bold text-on-surface sm:px-0">Bảng tin</h1>
      {failed ? (
        <div className="rounded-xl border border-dashed border-error/40 py-16 text-center text-on-surface-variant">
          <p className="mb-3">Không tải được bảng tin. Vui lòng thử lại.</p>
          <Button variant="outline" onClick={() => location.reload()}>Thử lại</Button>
        </div>
      ) : page.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
          Hãy theo dõi ai đó để xem bài review của họ tại đây.
        </div>
      ) : (
        <>
          <PostFeed posts={page.data} />
          {page.nextCursor !== null && (
            <div className="flex justify-center py-4">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
