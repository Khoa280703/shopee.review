'use client';

import { useState } from 'react';
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
  // Fall back to the initial when there's no image OR the image fails to load
  // (broken URL, or an expired Facebook lookaside picture URL).
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container font-semibold text-on-surface-variant',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {url && !failed ? (
        <Image
          src={url}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
