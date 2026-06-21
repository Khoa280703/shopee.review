'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '@/lib/constants';
import { notificationsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AppNotification } from '@/types';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    notificationsApi.list().then(setNotifications).catch(() => undefined);
    notificationsApi
      .unreadCount()
      .then((r) => setUnreadCount(r.count))
      .catch(() => undefined);

    const eventSource = new EventSource(`${API_URL}/notifications/stream`, {
      withCredentials: true,
    });
    eventSource.onmessage = (e) => {
      if (e.data === 'ping') return;
      try {
        const notification: AppNotification = JSON.parse(e.data);
        setNotifications((prev) => [notification, ...prev]);
        setUnreadCount((c) => c + 1);
      } catch {
        // ignore malformed events
      }
    };
    eventSource.onerror = () => eventSource.close();

    return () => eventSource.close();
  }, [user]);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return { notifications, unreadCount, markAllRead };
}
