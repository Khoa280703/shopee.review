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
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      return;
    }

    notificationsApi
      .list()
      .then((page) => {
        setNotifications(page.data);
        setNextCursor(page.nextCursor);
      })
      .catch(() => undefined);
    notificationsApi
      .unreadCount()
      .then((r) => setUnreadCount(r.count))
      .catch(() => undefined);

    // Manual reconnect with backoff. The browser's built-in EventSource retry
    // fires for transient network drops, but on a 401 (session revoked/banned)
    // it would hammer the endpoint — so we cap attempts and stop. A closed
    // stream that reopens cleanly resets the attempt counter via onopen.
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let stopped = false;
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 3000;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(`${API_URL}/notifications/stream`, {
        withCredentials: true,
      });
      source.onopen = () => {
        attempts = 0;
      };
      source.onmessage = (e) => {
        if (e.data === 'ping') return;
        try {
          const notification: AppNotification = JSON.parse(e.data);
          setNotifications((prev) => [notification, ...prev]);
          setUnreadCount((c) => c + 1);
        } catch {
          // ignore malformed events
        }
      };
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        attempts += 1;
        // Give up after MAX_ATTEMPTS (covers the 401/revoked-session case where
        // reconnecting can never succeed until the user logs in again).
        if (attempts > MAX_ATTEMPTS) return;
        retryTimer = setTimeout(connect, RETRY_DELAY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [user]);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await notificationsApi.list(nextCursor);
      setNotifications((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  return {
    notifications,
    unreadCount,
    markAllRead,
    loadMore,
    hasMore: nextCursor !== null,
    loadingMore,
  };
}
