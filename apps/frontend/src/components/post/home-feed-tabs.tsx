'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LoadMorePosts } from './load-more-posts';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import type { CursorPage, Post } from '@/types';

type Tab = 'forYou' | 'following';

/**
 * Home merges the old "Trang chủ" (explore) and "Bảng tin" (following) into two
 * tabs on one screen (For you / Following), the standard social-feed pattern.
 * The For-you page is SSR-seeded; Following fetches client-side (needs auth) and
 * prompts login when signed out.
 */
export function HomeFeedTabs({
  exploreInitial,
  defaultTab = 'forYou',
}: {
  exploreInitial: CursorPage<Post>;
  defaultTab?: Tab;
}) {
  const t = useTranslations('nav');
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(defaultTab);

  const tabClass = (active: boolean) =>
    cn(
      'flex-1 border-b-2 px-4 py-3 text-body-sm font-semibold transition-colors',
      active
        ? 'border-primary text-on-surface'
        : 'border-transparent text-on-surface-variant hover:text-on-surface',
    );

  return (
    <div>
      <div className="sticky top-0 z-10 mb-md flex border-b border-outline-variant bg-background/95 backdrop-blur-sm">
        <button type="button" onClick={() => setTab('forYou')} className={tabClass(tab === 'forYou')}>
          {t('forYou')}
        </button>
        <button type="button" onClick={() => setTab('following')} className={tabClass(tab === 'following')}>
          {t('following')}
        </button>
      </div>

      {tab === 'forYou' ? (
        <LoadMorePosts initial={exploreInitial} source={{ type: 'explore' }} variant="feed" />
      ) : user ? (
        <LoadMorePosts source={{ type: 'feed' }} variant="feed" />
      ) : (
        <div className="rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
          <p className="mb-3">{t('following')}</p>
          <Link
            href="/auth/login"
            className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-body-sm font-bold text-on-primary"
          >
            {t('login')}
          </Link>
        </div>
      )}
    </div>
  );
}
