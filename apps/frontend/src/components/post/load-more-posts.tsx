'use client';

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { feedApi, postsApi, usersApi } from '@/lib/api';
import { PostFeed, PostGrid } from './post-grid';
import type { CursorPage, Post } from '@/types';

type Source =
  | { type: 'explore'; categoryId?: number } // scored feed: home page
  | { type: 'posts'; categoryId?: number; search?: string } // plain list
  | { type: 'user'; username: string; hasProduct?: boolean }
  | { type: 'feed' };

interface Props {
  // SSR-seeded first page. Omit for client-only sources (e.g. the personalized
  // feed, which can't be server-rendered without the auth cookie) so the query
  // actually fetches on mount instead of treating an empty page as fresh data.
  initial?: CursorPage<Post>;
  source: Source;
  variant?: 'feed' | 'grid'; // feed = single column social style, grid = profile grid
}

function fetchPage(source: Source, cursor?: number): Promise<CursorPage<Post>> {
  if (source.type === 'explore') return postsApi.explore(cursor, source.categoryId);
  if (source.type === 'user')
    return usersApi.posts(source.username, cursor, false, source.hasProduct);
  if (source.type === 'feed') return feedApi.get(cursor);
  return postsApi.list({ cursor, categoryId: source.categoryId, search: source.search });
}

export function LoadMorePosts({ initial, source, variant = 'feed' }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts', source],
    queryFn: ({ pageParam }) => fetchPage(source, pageParam),
    initialPageParam: undefined as number | undefined,
    // Hydrate page 1 from the server-rendered data (no double fetch / flash)
    // when provided; otherwise fetch on mount.
    initialData: initial
      ? { pages: [initial], pageParams: [undefined as number | undefined] }
      : undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const posts = data?.pages.flatMap((p) => p.data) ?? [];

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div>
      {variant === 'feed' ? <PostFeed posts={posts} /> : <PostGrid posts={posts} />}
      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-4 text-body-sm text-on-surface-variant">
          {isFetchingNextPage ? 'Đang tải...' : ''}
        </div>
      )}
    </div>
  );
}
