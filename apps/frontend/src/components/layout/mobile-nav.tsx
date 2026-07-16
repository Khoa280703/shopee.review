'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';

export function MobileNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const items = [
    { href: '/', icon: 'home', label: t('home') },
    { href: '/search', icon: 'search', label: t('search') },
    { href: '/create', icon: 'add_circle', label: t('post'), auth: true },
    { href: '/notifications', icon: 'notifications', label: t('notifications'), auth: true },
    { href: user ? `/${user.username}` : '/auth/login', icon: 'person', label: t('profile') },
  ];

  return (
    <nav className="pb-safe fixed bottom-0 left-0 right-0 z-30 border-t border-outline-variant bg-surface/90 shadow-lg backdrop-blur-md lg:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <button
              key={item.label}
              onClick={() => {
                if (item.auth && !user) {
                  router.push('/auth/login');
                  return;
                }
                router.push(item.href);
              }}
              className={cn(
                'flex scale-110 flex-col items-center justify-center font-medium transition-transform duration-150 active:scale-100',
                active
                  ? 'rounded-full bg-primary-fixed/30 px-4 py-1 font-bold text-primary'
                  : 'px-3 text-on-surface-variant',
              )}
            >
              <Icon name={item.icon} fill={active} className="text-[24px]" />
              <span className="font-label-caps text-label-caps">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
