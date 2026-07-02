import { cn } from '@/lib/cn';
import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary', className)}
      {...props}
    />
  );
}
