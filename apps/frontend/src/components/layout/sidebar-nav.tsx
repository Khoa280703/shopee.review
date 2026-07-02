'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { buttonClasses } from '@/components/ui/button-classes';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

export function SidebarNav() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const baseItems = [
    { href: '/', icon: 'home', label: 'Trang chủ' },
    { href: '/search', icon: 'search', label: 'Khám phá' },
  ];

  const authItems = user
    ? [
        { href: '/notifications', icon: 'notifications', label: 'Thông báo' },
        { href: '/feed', icon: 'rss_feed', label: 'Bảng tin' },
        { href: `/${user.username}`, icon: 'person', label: 'Trang cá nhân' },
        { href: '/dashboard', icon: 'monitoring', label: 'Thống kê' },
      ]
    : [];

  const navItems = [...baseItems, ...authItems];

  return (
    <nav className="fixed left-0 top-0 z-50 hidden h-screen w-[72px] flex-col items-center gap-1 border-r border-outline-variant bg-surface py-md lg:flex">
      {/* Logo */}
      <Link href="/" className="mb-sm flex h-12 w-12 items-center justify-center" title="shopee.review">
        <Icon name="storefront" fill className="text-[32px] text-primary" />
      </Link>

      {/* Nav items */}
      <div className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl transition-all hover:bg-surface-container-high',
                active ? 'text-primary' : 'text-on-surface-variant',
              )}
            >
              <Icon name={item.icon} fill={active} className="text-[26px]" />
            </Link>
          );
        })}

        {/* Post CTA */}
        <button
          onClick={() => router.push(user ? '/create' : '/auth/login')}
          title="Đăng bài"
          className={buttonClasses({ size: 'md', className: 'mt-sm h-12 w-12 rounded-xl p-0' })}
        >
          <Icon name="add" className="text-[26px]" />
        </button>
      </div>

      {/* Footer */}
      {!loading && (
        <div className="flex flex-col items-center gap-1 border-t border-outline-variant pt-sm">
          {user ? (
            <>
              <Link
                href="/settings"
                title="Cài đặt"
                className="flex h-12 w-12 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:bg-surface-container-high"
              >
                <Icon name="settings" className="text-[24px]" />
              </Link>
              <button
                onClick={() => { void logout(); router.push('/'); }}
                title={`@${user.username} — Đăng xuất`}
                className="flex h-12 w-12 items-center justify-center rounded-xl transition-all hover:bg-error-container"
              >
                <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              title="Đăng nhập"
              className={buttonClasses({ size: 'md', className: 'h-12 w-12 rounded-xl p-0' })}
            >
              <Icon name="login" className="text-[24px]" />
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
