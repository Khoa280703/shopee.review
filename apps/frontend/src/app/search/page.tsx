'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
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

  useEffect(() => {
    const q = initialQ.trim();
    if (!q) {
      setPosts([]);
      setUsers([]);
      return;
    }
    setLoading(true);
    searchApi
      .query(q, 'all')
      .then((res) => {
        setPosts(res.posts);
        setUsers(res.users);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [initialQ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="space-y-5 py-4">
      <form onSubmit={submit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm bài review, người dùng..."
          className="h-11 w-full rounded-full border border-slate-300 px-5 text-sm outline-none focus:border-orange-500"
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
                  'rounded-full px-4 py-1.5 text-sm',
                  tab === t ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {t === 'posts' ? `Bài viết (${posts.length})` : `Người dùng (${users.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Đang tìm...</p>
          ) : tab === 'posts' ? (
            <PostGrid posts={posts} />
          ) : (
            <div className="space-y-2">
              {users.length === 0 ? (
                <p className="text-sm text-slate-400">Không tìm thấy người dùng.</p>
              ) : (
                users.map((u) => (
                  <Link
                    key={u.id}
                    href={`/${u.username}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50"
                  >
                    <Avatar src={u.avatarUrl} name={u.displayName} size={44} />
                    <div>
                      <p className="font-semibold">{u.displayName}</p>
                      <p className="text-xs text-slate-400">@{u.username}</p>
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
    <Suspense fallback={<div className="py-16 text-center text-slate-500">Đang tải...</div>}>
      <SearchInner />
    </Suspense>
  );
}
