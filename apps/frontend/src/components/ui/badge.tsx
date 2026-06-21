import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex rounded px-2 py-0.5 text-xs font-medium', className)} {...props} />;
}
