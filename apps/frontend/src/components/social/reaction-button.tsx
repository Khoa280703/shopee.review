'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/icon';
import { socialApi, type ReactionKind } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

interface Props {
  postId: number;
  initialCount: number;
  variant?: 'button' | 'icon';
}

interface ReactionState {
  type: ReactionKind | null;
  counts: Record<string, number>;
}

const REACTIONS: { type: ReactionKind; emoji: string }[] = [
  { type: 'LIKE', emoji: '👍' },
  { type: 'LOVE', emoji: '❤️' },
  { type: 'HAHA', emoji: '😆' },
  { type: 'WOW', emoji: '😮' },
  { type: 'SAD', emoji: '😢' },
  { type: 'ANGRY', emoji: '😠' },
];

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((s, n) => s + n, 0);

// Mirror the backend toggle so the UI updates instantly and stays consistent
// under rapid taps: same type → remove, different type → switch, none → add.
function applyOptimistic(state: ReactionState, type: ReactionKind): ReactionState {
  const counts = { ...state.counts };
  const bump = (t: string, d: number) => {
    counts[t] = Math.max(0, (counts[t] ?? 0) + d);
  };
  if (state.type === type) {
    bump(type, -1);
    return { type: null, counts };
  }
  if (state.type) bump(state.type, -1);
  bump(type, 1);
  return { type, counts };
}

export function ReactionButton({ postId, initialCount, variant = 'button' }: Props) {
  const t = useTranslations('social');
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const key = ['reactionStatus', postId];

  const { data } = useQuery<ReactionState>({
    queryKey: key,
    queryFn: () => socialApi.reactionStatus(postId),
    enabled: !!user,
    // placeholderData (not initialData): initialData is treated as real, fresh
    // cache, so the query never fetched and a user's OWN existing reaction wasn't
    // shown — the first tap then toggled the wrong way. placeholderData renders
    // the counts immediately but still fetches the real status on mount.
    placeholderData: { type: null, counts: { LIKE: initialCount } },
  });

  const { mutate } = useMutation({
    mutationFn: (type: ReactionKind) => socialApi.react(postId, type),
    // Optimistic + reconcile: update the cache immediately, roll back on error,
    // and always refetch on settle so out-of-order responses from rapid taps
    // can't leave a wrong final state (the server is authoritative).
    onMutate: async (type: ReactionKind) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ReactionState>(key);
      if (prev) queryClient.setQueryData<ReactionState>(key, applyOptimistic(prev, type));
      return { prev };
    },
    onError: (_e, _type, ctx) => {
      if (ctx?.prev) queryClient.setQueryData<ReactionState>(key, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const current = data?.type ?? null;
  const count = data ? total(data.counts) : initialCount;
  const active = REACTIONS.find((r) => r.type === current);

  function pick(type: ReactionKind) {
    setPickerOpen(false);
    if (!user) {
      router.push('/auth/login');
      return;
    }
    mutate(type);
  }

  // Single tap = toggle LIKE (muscle memory); the picker offers the other types.
  const onTap = () => pick(current ? current : 'LIKE');

  const picker = pickerOpen && (
    <div
      className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full border border-outline-variant bg-surface p-1 shadow-lg"
      onMouseLeave={() => setPickerOpen(false)}
    >
      {REACTIONS.map((r) => (
        <button
          key={r.type}
          onClick={() => pick(r.type)}
          title={t(`reactions.${r.type}`)}
          className="text-2xl transition-transform hover:scale-125"
        >
          {r.emoji}
        </button>
      ))}
    </div>
  );

  if (variant === 'icon') {
    return (
      <div className="relative" onMouseEnter={() => user && setPickerOpen(true)}>
        {picker}
        <button
          onClick={onTap}
          className={cn(
            'group flex items-center gap-xs transition-colors',
            current ? 'text-like' : 'hover:text-like',
          )}
          aria-label={t('reactions.ariaLabel')}
        >
          <span className={cn('flex items-center justify-center rounded-full p-2 transition-colors', current ? 'bg-like/10' : 'group-hover:bg-like/10')}>
            {active ? <span className="text-[18px] leading-none">{active.emoji}</span> : <Icon name="favorite" className="text-[20px]" />}
          </span>
          <span className="font-body-sm text-body-sm">{formatNumber(count)}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-block" onMouseEnter={() => user && setPickerOpen(true)}>
      {picker}
      <button
        onClick={onTap}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-body-sm font-medium transition',
          current
            ? 'border-primary-fixed bg-primary-fixed text-primary'
            : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high',
        )}
      >
        {active ? <span className="text-[16px] leading-none">{active.emoji}</span> : <Icon name="favorite" className="text-[18px]" />}
        {formatNumber(count)} {active ? t(`reactions.${active.type}`) : t('reactions.LIKE')}
      </button>
    </div>
  );
}
