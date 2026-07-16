'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/icon';
import { socialApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

interface Props {
  postId: number;
  initialBookmarked?: boolean;
}

export function BookmarkButton({ postId, initialBookmarked = false }: Props) {
  const t = useTranslations('social');
  const { user } = useAuth();
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setPending(true);
    // optimistic
    setBookmarked((b) => !b);
    try {
      const res = await socialApi.bookmark(postId);
      setBookmarked(res.bookmarked);
    } catch {
      setBookmarked((b) => !b); // revert
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-label={t('bookmark.ariaLabel')}
      className={cn('flex items-center gap-xs transition-colors', bookmarked ? 'text-primary' : 'hover:text-primary')}
    >
      <Icon name="bookmark" fill={bookmarked} className="text-lg" />
    </button>
  );
}
