import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClasses(
  opts: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    className?: string;
  } = {},
) {
  const { variant = 'primary', size = 'md', fullWidth, className } = opts;
  return cn(
    'inline-flex cursor-pointer items-center justify-center gap-sm rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' && 'h-8 px-3 text-body-sm',
    size === 'md' && 'h-10 px-4 text-body-sm',
    size === 'lg' && 'h-11 px-5 text-body-sm font-semibold',
    fullWidth && 'w-full',
    variant === 'primary' && 'bg-primary text-on-primary hover:bg-primary-container',
    variant === 'secondary' && 'bg-surface-container text-on-surface hover:bg-surface-container-high',
    variant === 'outline' && 'border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high',
    variant === 'danger' && 'bg-error text-on-error hover:opacity-90',
    variant === 'ghost' && 'text-on-surface-variant hover:bg-surface-container-high',
    className,
  );
}
