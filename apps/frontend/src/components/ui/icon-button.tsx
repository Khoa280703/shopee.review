import { cn } from '@/lib/cn';
import { Icon } from './icon';
import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  fill?: boolean;
  label: string;
  iconClassName?: string;
}

export function IconButton({ icon, fill, label, className, iconClassName, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high',
        className,
      )}
      {...props}
    >
      <Icon name={icon} fill={fill} className={iconClassName} />
    </button>
  );
}
