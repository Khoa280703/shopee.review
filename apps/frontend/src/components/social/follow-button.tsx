'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

interface Props {
  username: string;
  // Provided when the server already knows the state (profile page). Omitted on
  // pages without server auth (post detail) → the button fetches it itself.
  initialFollowing?: boolean;
  className?: string;
}

export function FollowButton({ username, initialFollowing, className }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ['followStatus', username];
  const hasServerState = initialFollowing !== undefined;

  // Never offer "follow yourself" — the backend rejects it and the optimistic
  // toggle would just flicker. Hide the button on your own profile/posts.
  const isSelf = user?.username === username;

  // With a server-provided value: seed the cache and treat it as fresh forever.
  // Without one: actually fetch (enabled only when logged in) — otherwise a
  // hardcoded initialData + staleTime:Infinity would stop the query from ever
  // running, leaving the button stuck on the wrong state.
  const { data: following = false } = useQuery<boolean>({
    queryKey: key,
    queryFn: hasServerState
      ? () => Promise.resolve(initialFollowing as boolean)
      : () => socialApi.followStatus(username).then((r) => r.following),
    ...(hasServerState
      ? { initialData: initialFollowing as boolean, staleTime: Infinity }
      : { enabled: !!user, staleTime: 60_000 }),
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

  if (isSelf) return null;

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
