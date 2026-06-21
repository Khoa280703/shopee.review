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
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 font-semibold text-orange-600',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
