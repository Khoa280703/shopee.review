'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/use-notifications';
import { timeAgo } from '@/lib/format';
import type { AppNotification } from '@/types';

function notificationText(n: AppNotification): string {
  switch (n.type) {
    case 'LIKE':
      return 'đã thích bài review của bạn';
    case 'COMMENT':
      return 'đã bình luận về bài review của bạn';
    case 'FOLLOW':
      return 'đã theo dõi bạn';
    default:
      return 'đã nhắc đến bạn';
  }
}

function NotificationIcon({ type }: { type: AppNotification['type'] }) {
  if (type === 'LIKE') return <Heart size={14} className="text-red-500" />;
  if (type === 'COMMENT') return <MessageCircle size={14} className="text-blue-500" />;
  if (type === 'FOLLOW') return <UserPlus size={14} className="text-green-500" />;
  return <Bell size={14} />;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) void markAllRead();
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-full p-2 hover:bg-slate-100" aria-label="Thông báo">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b px-4 py-2 text-sm font-semibold">Thông báo</div>
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Chưa có thông báo</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.post ? `/${n.actor.username}` : `/${n.actor.username}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 border-b px-4 py-3 last:border-0 hover:bg-slate-50"
                >
                  <Avatar src={n.actor.avatarUrl} name={n.actor.displayName} size={36} />
                  <div className="flex-1 text-sm">
                    <p>
                      <span className="font-semibold">{n.actor.displayName}</span>{' '}
                      <NotificationIcon type={n.type} /> {notificationText(n)}
                    </p>
                    <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
