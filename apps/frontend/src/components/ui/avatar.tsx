import Image from 'next/image';
import { cn } from '@/lib/cn';
import { resolveAssetUrl } from '@/lib/constants';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const url = resolveAssetUrl(src);
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || '?';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container font-semibold text-on-surface-variant',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {url ? (
        <Image
          src={url}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}
