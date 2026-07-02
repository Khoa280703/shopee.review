'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/icon';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

interface Props {
  postId: number;
  initialCount: number;
  variant?: 'button' | 'icon';
}

interface LikeState {
  count: number;
  isLiked: boolean;
}

export function LikeButton({ postId, initialCount, variant = 'button' }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ['likeStatus', postId];

  const { data } = useQuery<LikeState>({
    queryKey: key,
    queryFn: () => socialApi.likeStatus(postId),
    enabled: !!user,
    initialData: { count: initialCount, isLiked: false },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (next: boolean) =>
      next ? socialApi.like(postId) : socialApi.unlike(postId),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<LikeState>(key);
      queryClient.setQueryData<LikeState>(key, (cur) => {
        const base = cur ?? { count: initialCount, isLiked: false };
        return { isLiked: next, count: base.count + (next ? 1 : -1) };
      });
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      if (user) void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const liked = data?.isLiked ?? false;
  const count = data?.count ?? initialCount;

  function toggle() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    mutate(!liked);
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={toggle}
        disabled={isPending}
        className={cn(
          'group flex items-center gap-xs transition-colors',
          liked ? 'text-like' : 'hover:text-like',
        )}
        aria-label="Thích"
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-full p-2 transition-colors',
            liked ? 'bg-like/10' : 'group-hover:bg-like/10',
          )}
        >
          <Icon name="favorite" fill={liked} className="text-[20px]" />
        </span>
        <span className="font-body-sm text-body-sm">{formatNumber(count)}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-body-sm font-medium transition',
        liked
          ? 'border-primary-fixed bg-primary-fixed text-primary'
          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high',
      )}
    >
      <Icon name="favorite" fill={liked} className="text-[18px]" />
      {formatNumber(count)} Thích
    </button>
  );
}
