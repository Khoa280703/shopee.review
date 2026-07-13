import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  label: string;
  children: ReactNode;
  /** Side the tooltip appears on relative to the trigger. Default: right. */
  side?: 'right' | 'top';
  className?: string;
}

/**
 * Lightweight CSS-only tooltip. No JS state — appears on hover/focus-within via
 * `group-hover`/`group-focus-within`, so it works in SSR and needs no client boundary.
 * Built for the icon-only sidebar rail (default `side="right"`).
 */
export function Tooltip({ label, children, side = 'right', className }: TooltipProps) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[60] whitespace-nowrap rounded-md bg-inverse-surface px-2 py-1',
          'text-xs font-medium text-inverse-on-surface shadow-md',
          'scale-95 opacity-0 transition-all duration-150',
          'group-hover/tt:scale-100 group-hover/tt:opacity-100',
          'group-focus-within/tt:scale-100 group-focus-within/tt:opacity-100',
          side === 'right' && 'left-full top-1/2 ml-2 -translate-y-1/2 origin-left',
          side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2 origin-bottom',
        )}
      >
        {label}
      </span>
    </span>
  );
}
