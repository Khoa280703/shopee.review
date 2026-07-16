'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
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
        { href: '/saved', icon: 'bookmark', label: 'Đã lưu' },
        { href: `/${user.username}`, icon: 'person', label: 'Trang cá nhân' },
        { href: '/dashboard', icon: 'monitoring', label: 'Thống kê' },
        ...(user.isAdmin ? [{ href: '/admin', icon: 'shield', label: 'Quản trị' }] : []),
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
        <Tooltip label="Đăng bài" className="mt-sm">
          <button
            onClick={() => router.push(user ? '/create' : '/auth/login')}
            aria-label="Đăng bài"
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
              <Tooltip label={`@${user.username} — Trang cá nhân`}>
                <Link
                  href={`/${user.username}`}
                  aria-label={`Trang cá nhân của @${user.username}`}
                  className="flex h-12 w-12 items-center justify-center rounded-xl transition-all hover:bg-surface-container-high"
                >
                  <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
                </Link>
              </Tooltip>
              <Tooltip label="Cài đặt">
                <Link
                  href="/settings"
                  aria-label="Cài đặt"
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:bg-surface-container-high"
                >
                  <Icon name="settings" className="text-[24px]" />
                </Link>
              </Tooltip>
              <Tooltip label="Đăng xuất">
                <button
                  onClick={() => { void logout(); router.push('/'); }}
                  aria-label="Đăng xuất"
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:bg-error-container"
                >
                  <Icon name="logout" className="text-[24px]" />
                </button>
              </Tooltip>
            </>
          ) : (
            <Tooltip label="Đăng nhập">
              <Link
                href="/auth/login"
                aria-label="Đăng nhập"
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
