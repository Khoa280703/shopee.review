'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/format';

/**
 * Renders a relative timestamp. timeAgo() depends on Date.now(), which differs
 * between the SSR render and hydration and otherwise triggers a React hydration
 * mismatch. suppressHydrationWarning accepts the initial diff; the mount effect
 * then recomputes against the client clock (and keeps it reasonably fresh).
 */
export function TimeAgo({ date, className }: { date: string; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    tick(1);
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={date} suppressHydrationWarning className={className}>
      {timeAgo(date)}
    </time>
  );
}
