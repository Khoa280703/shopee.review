'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

interface Props {
  postId: number;
  initialCount: number;
}

export function LikeButton({ postId, initialCount }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user) return;
    socialApi
      .likeStatus(postId)
      .then((s) => {
        setLiked(s.isLiked);
        setCount(s.count);
      })
      .catch(() => undefined);
  }, [postId, user]);

  async function toggle() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    setPending(true);
    try {
      if (next) await socialApi.like(postId);
      else await socialApi.unlike(postId);
    } catch {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition',
        liked ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      <Heart size={16} className={liked ? 'fill-red-600' : ''} />
      {formatNumber(count)} Thích
    </button>
  );
}
