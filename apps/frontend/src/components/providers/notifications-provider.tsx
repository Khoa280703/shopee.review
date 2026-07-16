'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useNotifications } from '@/hooks/use-notifications';

type NotificationsValue = ReturnType<typeof useNotifications>;

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Runs useNotifications() ONCE for the whole app so the notification bell badge
 * (in the sidebar/mobile nav/header) and the notifications page share a single
 * SSE stream + unread count instead of each opening their own EventSource.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotificationsContext(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationsProvider');
  return ctx;
}
