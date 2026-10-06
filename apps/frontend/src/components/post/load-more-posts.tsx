'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useInfiniteQuery } from '@tanstack/react-query';
import { feedApi, postsApi, usersApi } from '@/lib/api';
import { PostFeed, PostGrid, PostFeedSkeleton, PostGridSkeleton } from './post-grid';
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
  // Shown only once loading has finished AND the result is truly empty (not
  // while loading, not on error) — FE audit H3 ("Đang theo dõi" used to always
  // render this under the feed, even mid-load or on a network error).
  emptyState?: React.ReactNode;
}

function fetchPage(source: Source, cursor?: number): Promise<CursorPage<Post>> {
  if (source.type === 'explore') return postsApi.explore(cursor, source.categoryId);
  if (source.type === 'user')
    return usersApi.posts(source.username, cursor, false, source.hasProduct);
  if (source.type === 'feed') return feedApi.get(cursor);
  return postsApi.list({ cursor, categoryId: source.categoryId, search: source.search });
}

export function LoadMorePosts({ initial, source, variant = 'feed', emptyState }: Props) {
  const t = useTranslations('common');
  const post = useTranslations('post');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isLoading,
    isError,
    refetch,
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
    // Keyset pagination (score-ordered explore, cached per-offset) can hand
    // back a post already on an earlier page across fast-changing scores —
    // dedupe by id defensively (FE audit M17) rather than trusting every
    // page's rows to be disjoint.
    select: (d) => {
      const seen = new Set<number>();
      const pages = d.pages.map((p) => ({
        ...p,
        data: p.data.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true))),
      }));
      return { ...d, pages };
    },
    // A failed next-page fetch must not auto-retry forever: the intersection
    // observer below only fires again once `isFetchingNextPage` goes back to
    // false, which happened immediately on error — same request, same
    // failure, infinite loop (FE audit M16). Retrying is now an explicit
    // button click instead.
    retry: false,
  });

  const posts = data?.pages.flatMap((p) => p.data) ?? [];

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isFetchNextPageError
        ) {
          void fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  // Only the FIRST page's loading/error state replaces the whole list —
  // never shown once any posts are already on screen, and never confused
  // with "no posts" (FE audit H3: the old code rendered the hard-coded
  // "Chưa có bài" text during the initial fetch and on network errors too).
  if (isLoading) {
    return variant === 'feed' ? <PostFeedSkeleton /> : <PostGridSkeleton />;
  }

  if (isError && posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-error/40 py-16 text-center text-on-surface-variant">
        <p>{error instanceof Error ? error.message : post('loadError')}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex h-9 items-center rounded-full border border-outline-variant px-5 text-body-sm font-semibold text-on-surface hover:bg-surface-container"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return <>{emptyState ?? (variant === 'feed' ? <PostFeed posts={[]} /> : <PostGrid posts={[]} />)}</>;
  }

  return (
    <div>
      {variant === 'feed' ? <PostFeed posts={posts} /> : <PostGrid posts={posts} />}
      {hasNextPage && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-4 text-body-sm text-on-surface-variant">
          {isFetchingNextPage && t('loading')}
          {isFetchNextPageError && (
            <>
              <p className="text-error">{post('loadMoreError')}</p>
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="inline-flex h-8 items-center rounded-full border border-outline-variant px-4 text-label-caps font-semibold text-on-surface hover:bg-surface-container"
              >
                {t('retry')}
              </button>
            </>
          )}
        </div>
      )}
      {!hasNextPage && posts.length > 0 && (
        <p className="py-4 text-center text-label-caps text-on-surface-variant">{post('endOfList')}</p>
      )}
    </div>
  );
}
