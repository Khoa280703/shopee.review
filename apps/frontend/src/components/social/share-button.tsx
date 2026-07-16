'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/icon';
import { socialApi } from '@/lib/api';
import { SITE_URL } from '@/lib/constants';
import { formatNumber } from '@/lib/format';

interface Props {
  postId: number;
  username: string;
  initialCount: number;
}

export function ShareButton({ postId, username, initialCount }: Props) {
  const t = useTranslations('social');
  const [count, setCount] = useState(initialCount);

  async function share() {
    const url = `${SITE_URL}/${username}/${postId}`;
    // Native share on mobile, clipboard fallback on desktop.
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ url });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // user cancelled share sheet — do not count
      return;
    }
    try {
      const res = await socialApi.share(postId);
      setCount(res.shareCount);
    } catch {
      setCount((c) => c + 1);
    }
  }

  return (
    <button
      onClick={share}
      aria-label={t('share.ariaLabel')}
      className="flex items-center gap-xs transition-colors hover:text-tertiary"
    >
      <Icon name="share" className="text-lg" />
      {count > 0 && <span className="font-body-sm text-body-sm">{formatNumber(count)}</span>}
    </button>
  );
}
