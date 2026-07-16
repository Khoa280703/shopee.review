'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { resolveAssetUrl } from '@/lib/constants';

export function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const t = useTranslations('post');
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return <div className="flex aspect-square items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">{t('noImage')}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-container">
        <Image
          src={resolveAssetUrl(images[active]) ?? ''}
          alt={alt}
          fill
          sizes="(max-width:700px) 100vw, 700px"
          className="object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img}
              onClick={() => setActive(i)}
              className={cn(
                'relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2',
                i === active ? 'border-primary' : 'border-transparent',
              )}
            >
              <Image
                src={resolveAssetUrl(img) ?? ''}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
