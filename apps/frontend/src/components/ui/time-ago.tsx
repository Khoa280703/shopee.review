'use client';

import { useEffect, useState } from 'react';
import { useFormatter } from 'next-intl';

/**
 * Locale-aware relative timestamp ("5 minutes ago" / "5 phút trước") via
 * next-intl's formatter, which reads the active locale. The relative base is the
 * current time, so it differs between the SSR render and hydration —
 * suppressHydrationWarning accepts that; the interval keeps it fresh on the client.
 */
export function TimeAgo({ date, className }: { date: string; className?: string }) {
  const format = useFormatter();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={date} suppressHydrationWarning className={className}>
      {format.relativeTime(new Date(date))}
    </time>
  );
}
