import { cn } from '@/lib/cn';
import type { TextareaHTMLAttributes } from 'react';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('min-h-24 w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary', className)}
      {...props}
    />
  );
}
