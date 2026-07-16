'use client';

import { useNotificationsContext } from '@/components/providers/notifications-provider';
import { useAuth } from '@/lib/auth-context';

/** Red unread-count pill overlaid on the notifications icon. Renders nothing when
 *  signed out or all-read. Reads the shared notifications context (single SSE). */
export function UnreadBadge() {
  const { user } = useAuth();
  const { unreadCount } = useNotificationsContext();
  if (!user || unreadCount <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-on-error">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
