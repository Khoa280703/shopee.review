'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { buttonClasses } from '@/components/ui/button-classes';
import { useAuth } from '@/lib/auth-context';
import { SITE_NAME } from '@/lib/constants';
import { UnreadBadge } from './unread-badge';

// Mobile/tablet header only — hidden on desktop (lg uses SidebarNav instead)
export function Header() {
  const common = useTranslations('common');
  const nav = useTranslations('nav');
  const { user, loading } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5">
          <Icon name="storefront" fill className="text-2xl text-primary" />
          <span className="font-display-lg-mobile text-xl font-bold tracking-tight text-primary">{SITE_NAME}</span>
        </Link>

        <div className="flex items-center gap-1">
          <IconButton
            icon="search"
            label={common('search')}
            iconClassName="text-[22px]"
            onClick={() => router.push('/search')}
          />
          {!loading && user && (
            <>
              <Link
                href="/saved"
                className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label={nav('saved')}
              >
                <Icon name="bookmark" className="text-[22px]" />
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label={nav('dashboard')}
              >
                <Icon name="monitoring" className="text-[22px]" />
              </Link>
              <Link
                href="/notifications"
                className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label={nav('notifications')}
              >
                <Icon name="notifications" className="text-[22px]" />
                <UnreadBadge />
              </Link>
            </>
          )}
          {!loading && user ? (
            <Link href={`/${user.username}`} className="ml-1 rounded-full">
              <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
            </Link>
          ) : !loading ? (
            <Link href="/auth/login" className={buttonClasses({ size: 'sm', className: 'ml-2' })}>
              {nav('login')}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
