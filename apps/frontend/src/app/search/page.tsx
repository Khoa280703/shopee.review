'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { PostGrid } from '@/components/post/post-grid';
import { searchApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Post, UserProfile } from '@/types';

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initialQ = params.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [tab, setTab] = useState<'posts' | 'users'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = initialQ.trim();
    if (!q) {
      setPosts([]);
      setUsers([]);
      return;
    }
    setLoading(true);
    setFailed(false);
    searchApi
      .query(q, 'all')
      .then((res) => {
        setPosts(res.posts);
        setUsers(res.users);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [initialQ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 py-lg">
      <form onSubmit={submit} className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm bài review, người dùng..."
          className="h-12 rounded-full pl-12 pr-5"
        />
      </form>

      {initialQ && (
        <>
          <div className="flex gap-2">
            {(['posts', 'users'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-body-sm font-medium transition',
                  tab === t
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                )}
              >
                {t === 'posts' ? `Bài viết (${posts.length})` : `Người dùng (${users.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-body-sm text-on-surface-variant">Đang tìm...</p>
          ) : failed ? (
            <p className="text-body-sm text-error">Tìm kiếm thất bại. Vui lòng thử lại.</p>
          ) : tab === 'posts' ? (
            <PostGrid posts={posts} />
          ) : (
            <div className="space-y-2">
              {users.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">Không tìm thấy người dùng.</p>
              ) : (
                users.map((u) => (
                  <Link
                    key={u.id}
                    href={`/${u.username}`}
                    className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 transition hover:bg-surface-container-high"
                  >
                    <Avatar src={u.avatarUrl} name={u.displayName} size={44} />
                    <div>
                      <p className="font-semibold text-on-surface">{u.displayName}</p>
                      <p className="text-label-caps text-on-surface-variant">@{u.username}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-on-surface-variant">Đang tải...</div>}>
      <SearchInner />
    </Suspense>
  );
}
