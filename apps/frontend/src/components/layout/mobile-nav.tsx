'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, PlusCircle, Rss, Search, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const items = [
    { href: '/', icon: Home, label: 'Trang chủ' },
    { href: '/search', icon: Search, label: 'Tìm kiếm' },
    { href: '/create', icon: PlusCircle, label: 'Đăng', auth: true },
    { href: '/feed', icon: Rss, label: 'Bảng tin', auth: true },
    { href: user ? `/${user.username}` : '/auth/login', icon: User, label: 'Cá nhân' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white sm:hidden">
      <div className="flex h-14 items-center justify-around">
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
                'flex flex-col items-center gap-0.5 px-3 text-xs',
                active ? 'text-orange-500' : 'text-slate-500',
              )}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
