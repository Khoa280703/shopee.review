'use client';

import { useState } from 'react';
import { feedApi, postsApi, usersApi } from '@/lib/api';
import { PostGrid } from './post-grid';
import type { CursorPage, Post } from '@/types';

type Source =
  | { type: 'posts'; categoryId?: number; search?: string }
  | { type: 'user'; username: string }
  | { type: 'feed' };

interface Props {
  initial: CursorPage<Post>;
  source: Source;
}

export function LoadMorePosts({ initial, source }: Props) {
  const [posts, setPosts] = useState<Post[]>(initial.data);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (cursor === null || loading) return;
    setLoading(true);
    try {
      let page: CursorPage<Post>;
      if (source.type === 'user') {
        page = await usersApi.posts(source.username, cursor);
      } else if (source.type === 'feed') {
        page = await feedApi.get(cursor);
      } else {
        page = await postsApi.list({ cursor, categoryId: source.categoryId, search: source.search });
      }
      setPosts((prev) => [...prev, ...page.data]);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PostGrid posts={posts} />
      {cursor !== null && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-6 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? 'Đang tải...' : 'Xem thêm'}
          </button>
        </div>
      )}
    </div>
  );
}
