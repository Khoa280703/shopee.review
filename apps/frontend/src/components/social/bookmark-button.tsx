'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/providers/toast-provider';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/login-href';
import { cn } from '@/lib/cn';

interface Props {
  postId: number;
  // Backend-provided viewer state, when the page already fetched it as part
  // of a list payload. Omitted on the post detail page (which stays
  // anonymous/cacheable server-side) — the component fetches its own status
  // instead, same pattern as ReactionButton.
  initialBookmarked?: boolean;
}

export function BookmarkButton({ postId, initialBookmarked }: Props) {
  const t = useTranslations('social');
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const key = ['bookmarkStatus', postId];
  const hasServerState = initialBookmarked !== undefined;

  const { data } = useQuery<{ bookmarked: boolean }>({
    queryKey: key,
    queryFn: () => socialApi.bookmarkStatus(postId),
    enabled: !!user && !hasServerState,
    ...(hasServerState
      ? { initialData: { bookmarked: initialBookmarked }, staleTime: Infinity }
      : { placeholderData: { bookmarked: false } }),
  });
  const bookmarked = data?.bookmarked ?? false;

  // Idempotent set (FE audit H2): the mutation states the desired end state
  // instead of toggling, so a stale cache read can never flip it backwards.
  const { mutate, isPending } = useMutation({
    mutationFn: (next: boolean) => socialApi.setBookmark(postId, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<{ bookmarked: boolean }>(key);
      queryClient.setQueryData(key, { bookmarked: next });
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      toast(t('bookmark.error'), 'error');
    },
  });

  function toggle() {
    if (!user) {
      router.push(loginHref(pathname));
      return;
    }
    mutate(!bookmarked);
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      aria-label={t('bookmark.ariaLabel')}
      aria-pressed={bookmarked}
      className={cn('flex items-center gap-xs transition-colors', bookmarked ? 'text-primary' : 'hover:text-primary')}
    >
      <Icon name="bookmark" fill={bookmarked} className="text-lg" />
    </button>
  );
}
