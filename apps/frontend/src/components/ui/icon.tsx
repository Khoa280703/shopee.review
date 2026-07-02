import { cn } from '@/lib/cn';

interface IconProps {
  name: string;
  fill?: boolean;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

// Material Symbols Outlined glyph — matches the Stitch design system.
export function Icon({ name, fill = false, className, title, style }: IconProps) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn('material-symbols-outlined select-none', fill && 'icon-fill', className)}
      style={style}
    >
      {name}
    </span>
  );
}
