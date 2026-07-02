'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const key = ['followStatus', username];

  // Seed follow state into the cache so optimistic updates have a home and
  // multiple buttons for the same user stay in sync.
  const { data: following = initialFollowing } = useQuery<boolean>({
    queryKey: key,
    queryFn: () => Promise.resolve(initialFollowing),
    initialData: initialFollowing,
    staleTime: Infinity,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (next: boolean) =>
      next ? socialApi.follow(username) : socialApi.unfollow(username),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<boolean>(key) ?? initialFollowing;
      queryClient.setQueryData<boolean>(key, next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx) queryClient.setQueryData(key, ctx.prev);
    },
  });

  function toggle() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    mutate(!following);
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-full px-5 text-body-sm font-bold transition disabled:opacity-60',
        following
          ? 'border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high'
          : 'bg-inverse-surface text-inverse-on-surface hover:opacity-90',
        className,
      )}
    >
      {following ? 'Đang theo dõi' : 'Theo dõi'}
    </button>
  );
}
