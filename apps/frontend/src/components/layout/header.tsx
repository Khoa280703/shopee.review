'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, PlusCircle, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAuth } from '@/lib/auth-context';
import { SITE_NAME } from '@/lib/constants';

export function Header() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="shrink-0 text-lg font-bold text-orange-500">
          {SITE_NAME}
        </Link>

        <form onSubmit={onSearch} className="relative hidden flex-1 sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm bài review, người dùng..."
            className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-orange-500"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {!loading && user ? (
            <>
              <Link
                href="/create"
                className="hidden items-center gap-1 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 sm:inline-flex"
              >
                <PlusCircle size={16} /> Đăng bài
              </Link>
              <NotificationBell />
              <div className="relative">
                <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full">
                  <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <Link href={`/${user.username}`} className="block px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                        Trang cá nhân
                      </Link>
                      <Link href="/dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                        Thống kê
                      </Link>
                      <Link href="/settings" className="block px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                        Cài đặt
                      </Link>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          void logout();
                          router.push('/');
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-slate-50"
                      >
                        <LogOut size={14} /> Đăng xuất
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
                Đăng nhập
              </Link>
              <Link href="/auth/register" className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
