'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { buttonClasses } from '@/components/ui/button-classes';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

export function SidebarNav() {
  const t = useTranslations('nav');
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const baseItems = [
    { href: '/', icon: 'home', label: t('home') },
    { href: '/search', icon: 'search', label: t('search') },
  ];

  const authItems = user
    ? [
        { href: '/notifications', icon: 'notifications', label: t('notifications') },
        { href: '/saved', icon: 'bookmark', label: t('saved') },
        { href: `/${user.username}`, icon: 'person', label: t('profile') },
        { href: '/dashboard', icon: 'monitoring', label: t('dashboard') },
        ...(user.isAdmin ? [{ href: '/admin', icon: 'shield', label: t('admin') }] : []),
      ]
    : [];

  const navItems = [...baseItems, ...authItems];

  return (
    <nav className="fixed left-0 top-0 z-50 hidden h-screen w-[72px] flex-col items-center gap-1 border-r border-outline-variant bg-surface py-md lg:flex">
      {/* Logo */}
      <Tooltip label="shopee.review" className="mb-sm">
        <Link href="/" aria-label="shopee.review" className="flex h-12 w-12 items-center justify-center">
          <Icon name="storefront" fill className="text-[32px] text-primary" />
        </Link>
      </Tooltip>

      {/* Nav items */}
      <div className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Tooltip key={item.href} label={item.label}>
              <Link
                href={item.href}
                aria-label={item.label}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl transition-all hover:bg-surface-container-high',
                  active ? 'text-primary' : 'text-on-surface-variant',
                )}
              >
                <Icon name={item.icon} fill={active} className="text-[26px]" />
              </Link>
            </Tooltip>
          );
        })}

        {/* Post CTA */}
        <Tooltip label={t('post')} className="mt-sm">
          <button
            onClick={() => router.push(user ? '/create' : '/auth/login')}
            aria-label={t('post')}
            className={buttonClasses({ size: 'md', className: 'h-12 w-12 rounded-xl p-0' })}
          >
            <Icon name="add" className="text-[26px]" />
          </button>
        </Tooltip>
      </div>

      {/* Footer */}
      {!loading && (
        <div className="flex flex-col items-center gap-1 border-t border-outline-variant pt-sm">
          {user ? (
            <>
              <Tooltip label={`@${user.username} — ${t('profile')}`}>
                <Link
                  href={`/${user.username}`}
                  aria-label={`${t('profile')} (@${user.username})`}
                  className="flex h-12 w-12 items-center justify-center rounded-xl transition-all hover:bg-surface-container-high"
                >
                  <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
                </Link>
              </Tooltip>
              <Tooltip label={t('settings')}>
                <Link
                  href="/settings"
                  aria-label={t('settings')}
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:bg-surface-container-high"
                >
                  <Icon name="settings" className="text-[24px]" />
                </Link>
              </Tooltip>
              <Tooltip label={t('logout')}>
                <button
                  onClick={() => { void logout(); router.push('/'); }}
                  aria-label={t('logout')}
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:bg-error-container"
                >
                  <Icon name="logout" className="text-[24px]" />
                </button>
              </Tooltip>
            </>
          ) : (
            <Tooltip label={t('login')}>
              <Link
                href="/auth/login"
                aria-label={t('login')}
                className={buttonClasses({ size: 'md', className: 'h-12 w-12 rounded-xl p-0' })}
              >
                <Icon name="account_circle" className="text-[24px]" />
              </Link>
            </Tooltip>
          )}
        </div>
      )}
    </nav>
  );
}
