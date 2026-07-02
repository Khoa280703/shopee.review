import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export type ActionColor = 'tertiary' | 'secondary' | 'primary' | 'like';

// Static class maps — Tailwind JIT cannot resolve dynamic `hover:text-${x}` names.
const WRAPPER: Record<ActionColor, string> = {
  tertiary: 'hover:text-tertiary',
  secondary: 'hover:text-secondary',
  primary: 'hover:text-primary',
  like: 'hover:text-like',
};

const CIRCLE: Record<ActionColor, string> = {
  tertiary: 'group-hover:bg-tertiary/10',
  secondary: 'group-hover:bg-secondary/10',
  primary: 'group-hover:bg-primary/10',
  like: 'group-hover:bg-like/10',
};

// Wrapper class applied to the caller's <Link>/<a>/<button> element.
export function postActionWrapperClass(color: ActionColor, className?: string) {
  return cn('group flex items-center gap-xs transition-colors', WRAPPER[color], className);
}

interface PostActionContentProps {
  icon: string;
  count?: number;
  color: ActionColor;
  fill?: boolean;
  iconClassName?: string;
}

// Icon-circle + count content, shared by all action-bar items (DRY).
export function PostActionContent({ icon, count, color, fill, iconClassName }: PostActionContentProps) {
  return (
    <>
      <span className={cn('flex items-center justify-center rounded-full p-2 transition-colors', CIRCLE[color])}>
        <Icon name={icon} fill={fill} className={cn('text-[20px]', iconClassName)} />
      </span>
      {count !== undefined ? <span className="font-body-sm text-body-sm">{formatNumber(count)}</span> : null}
    </>
  );
}
