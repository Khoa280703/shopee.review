'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useNotifications } from '@/hooks/use-notifications';
import { TimeAgo } from '@/components/ui/time-ago';
import { cn } from '@/lib/cn';
import type { AppNotification, NotificationType } from '@/types';

const TAB_IDS: ('all' | NotificationType)[] = ['all', 'LIKE', 'COMMENT', 'FOLLOW'];

function meta(type: NotificationType): { icon: string; bg: string; fg: string } {
  switch (type) {
    case 'LIKE':
      return { icon: 'favorite', bg: 'bg-secondary-container', fg: 'text-on-secondary-container' };
    case 'COMMENT':
      return { icon: 'chat_bubble', bg: 'bg-tertiary-container', fg: 'text-on-tertiary-container' };
    case 'FOLLOW':
      return { icon: 'person_add', bg: 'bg-primary-container', fg: 'text-on-primary-container' };
    case 'NEW_POST':
      return { icon: 'post_add', bg: 'bg-primary-container', fg: 'text-on-primary-container' };
    default:
      return { icon: 'notifications', bg: 'bg-surface-container', fg: 'text-on-surface-variant' };
  }
}

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const { notifications, unreadCount, markAllRead, loadMore, hasMore, loadingMore } =
    useNotifications();
  const [tab, setTab] = useState<'all' | NotificationType>('all');

  // unreadCount is 0 on first render (the hook fetches it async), so a mount-only
  // effect never saw it > 0 and never marked anything read. Fire once it actually
  // loads, guarded so it runs a single time.
  const hasMarked = useRef(false);
  useEffect(() => {
    if (!hasMarked.current && unreadCount > 0) {
      hasMarked.current = true;
      void markAllRead();
    }
  }, [unreadCount, markAllRead]);

  const filtered = tab === 'all' ? notifications : notifications.filter((n) => n.type === tab);

  return (
    <div className="mx-auto flex w-full max-w-container-max gap-lg px-0 py-lg sm:px-4 lg:px-lg">
      <div className="flex w-full flex-1 flex-col gap-lg lg:max-w-[700px]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-container-high bg-background/95 px-4 py-sm backdrop-blur-sm sm:px-0">
          <h1 className="font-display-lg-mobile text-display-lg-mobile text-on-background">{t('title')}</h1>
        </div>

        {/* Filter chips */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-surface-container px-4 pb-3 sm:px-0">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'whitespace-nowrap rounded-full px-md py-sm font-label-caps text-label-caps transition-colors',
                tab === id
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'border border-outline-variant bg-surface-container-high text-on-surface hover:bg-surface-variant',
              )}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex flex-col sm:gap-sm">
          {filtered.length === 0 ? (
            <div className="mx-4 rounded-xl border border-dashed border-outline-variant py-16 text-center text-on-surface-variant sm:mx-0">
              {t('empty')}
            </div>
          ) : (
            filtered.map((n: AppNotification) => {
              const m = meta(n.type);
              return (
                <Link
                  key={n.id}
                  href={`/${n.actor.username}`}
                  className="group flex items-start gap-md border-b border-surface-container-high bg-surface p-md transition-colors hover:bg-surface-container-lowest sm:rounded-xl sm:border sm:shadow-sm sm:hover:shadow-md"
                >
                  <div
                    className={cn(
                      'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110',
                      m.bg,
                      m.fg,
                    )}
                  >
                    <Icon name={m.icon} fill className="text-[20px]" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-sm">
                      <Avatar src={n.actor.avatarUrl} name={n.actor.displayName} size={24} />
                      <p className="font-body-md text-body-md text-on-surface">
                        <strong>{n.actor.displayName}</strong> {t(`action.${n.type}`)}
                      </p>
                    </div>
                    {n.post?.title && (
                      <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant line-clamp-1">
                        “{n.post.title}”
                      </p>
                    )}
                    <TimeAgo date={n.createdAt} className="font-label-caps text-label-caps uppercase text-outline" />
                  </div>
                </Link>
              );
            })
          )}
          {tab === 'all' && hasMore && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-4 mt-md rounded-full border border-outline-variant py-sm font-label-caps text-label-caps text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60 sm:mx-0"
            >
              {loadingMore ? t('loadingMore') : t('showMore')}
            </button>
          )}
        </div>
      </div>

      {/* Right rail */}
      <aside className="hidden w-80 shrink-0 xl:block">
        <div className="rounded-xl border border-surface-container-high bg-surface p-md shadow-sm">
          <h3 className="mb-md font-headline-md text-headline-md text-on-surface">{t('tips.title')}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t('tips.body')}
          </p>
        </div>
      </aside>
    </div>
  );
}
