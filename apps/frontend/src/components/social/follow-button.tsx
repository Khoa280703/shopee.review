'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

interface Props {
  username: string;
  initialFollowing: boolean;
  className?: string;
}

export function FollowButton({ username, initialFollowing, className }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    const next = !following;
    setFollowing(next);
    setPending(true);
    try {
      if (next) await socialApi.follow(username);
      else await socialApi.unfollow(username);
    } catch {
      setFollowing(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition disabled:opacity-60',
        following
          ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          : 'bg-orange-500 text-white hover:bg-orange-600',
        className,
      )}
    >
      {following ? 'Đang theo dõi' : 'Theo dõi'}
    </button>
  );
}
