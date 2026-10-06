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
  const home = useTranslations('home');
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
      {/* top-14 clears the mobile header (h-14, sticky top-0 z-30) so this tab
          bar doesn't slide underneath it while scrolling (FE audit M6);
          desktop has no mobile header so it sticks flush to the viewport. */}
      <div className="sticky top-14 z-10 mb-md flex border-b border-outline-variant bg-background/95 backdrop-blur-sm lg:top-0">
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
        <LoadMorePosts
          source={{ type: 'feed' }}
          variant="feed"
          // Only rendered once loading is done AND the feed is truly empty —
          // it used to render unconditionally underneath real posts too, and
          // during every loading/error state (FE audit H3).
          emptyState={
            <div className="rounded-xl border border-dashed border-outline-variant py-10 text-center text-on-surface-variant">
              <p className="mb-3">{home('followingEmptyTitle')}</p>
              <button
                type="button"
                onClick={() => setTab('forYou')}
                className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-body-sm font-bold text-on-primary"
              >
                {home('exploreCta')}
              </button>
            </div>
          }
        />
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
