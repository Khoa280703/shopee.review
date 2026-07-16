'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** Tiny dependency-free toast system: transient, auto-dismissing feedback for
 *  actions that otherwise give none (link copied, save failed, etc.). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    // No Date.now()/Math.random dependency concerns here (client-only), but a
    // monotonic counter avoids duplicate keys on rapid fire.
    setToasts((prev) => {
      const id = (prev[prev.length - 1]?.id ?? 0) + 1;
      const next = [...prev, { id, message, kind }];
      setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3200);
      return next;
    });
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto max-w-sm rounded-full px-4 py-2 text-body-sm font-medium shadow-lg',
              t.kind === 'success' && 'bg-primary text-on-primary',
              t.kind === 'error' && 'bg-error text-on-error',
              t.kind === 'info' && 'bg-inverse-surface text-inverse-on-surface',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
