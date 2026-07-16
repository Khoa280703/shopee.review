'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PostFeedCard } from '@/components/post/post-feed-card';
import type { Post } from '@/types';

export default function SavedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    setFailed(false);
    socialApi
      .bookmarks()
      .then((page) => {
        setPosts(page.data);
        setCursor(page.nextCursor);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true));
  }, [user, loading, router]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await socialApi.bookmarks(cursor);
      setPosts((prev) => [...prev, ...page.data]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  if (loading || !user) {
    return <div className="py-16 text-center text-on-surface-variant">Đang tải...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-0 py-md sm:px-4">
      <h1 className="mb-md px-4 font-display-lg-mobile text-display-lg-mobile font-bold text-on-surface sm:px-0">
        Đã lưu
      </h1>
      {loaded && failed ? (
        <p className="mx-4 rounded-xl border border-dashed border-error/40 py-16 text-center text-on-surface-variant sm:mx-0">
          Không tải được danh sách đã lưu. Vui lòng thử lại.
        </p>
      ) : loaded && posts.length === 0 ? (
        <p className="mx-4 rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant sm:mx-0">
          Bạn chưa lưu bài viết nào.
        </p>
      ) : (
        <div className="flex flex-col gap-md">
          {posts.map((post) => (
            <PostFeedCard key={post.id} post={post} />
          ))}
          {cursor && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-4 rounded-full border border-outline-variant py-sm font-label-caps text-label-caps text-on-surface hover:bg-surface-container disabled:opacity-60 sm:mx-0"
            >
              {loadingMore ? 'Đang tải...' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
