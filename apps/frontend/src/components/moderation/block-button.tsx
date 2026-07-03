'use client';

import { useState } from 'react';
import { moderationApi } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Props {
  username: string;
  className?: string;
}

/** Block toggles to a "blocked" state; unblock via settings. */
export function BlockButton({ username, className }: Props) {
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      if (blocked) {
        await moderationApi.unblock(username);
        setBlocked(false);
      } else {
        await moderationApi.block(username);
        setBlocked(true);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={cn(
        'rounded-full border border-outline-variant px-4 py-1.5 text-body-sm font-semibold text-on-surface transition hover:bg-surface-container disabled:opacity-60',
        className,
      )}
    >
      {blocked ? 'Bỏ chặn' : 'Chặn'}
    </button>
  );
}
