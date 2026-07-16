'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/icon';
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

/**
 * Post-detail gallery: renders the hero + thumbnail grid (already-resolved,
 * absolute image URLs) and wires clicks to open a full-screen, closable
 * lightbox overlay. Client component so it can hold open/active-index state;
 * imported into the server-rendered post-detail page.
 */
export function PostGalleryLightbox({ images, alt }: { images: string[]; alt: string }) {
  const t = useTranslations('post');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const showPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    },
    [images.length],
  );
  const showNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
    },
    [images.length],
  );
  const close = useCallback(() => setOpenIndex(null), []);

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, close]);

  if (images.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-sm overflow-hidden rounded-xl">
        <button
          type="button"
          onClick={() => setOpenIndex(0)}
          className="relative col-span-2 h-80 bg-surface-container-low"
        >
          <Image
            src={images[0]}
            alt={alt}
            fill
            priority
            sizes="(max-width:700px) 100vw, 700px"
            className="object-cover"
          />
        </button>
        {images.slice(1, 3).map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenIndex(i + 1)}
            className="relative h-40 bg-surface-container-low"
          >
            <Image src={src} alt={alt} fill sizes="(max-width:700px) 50vw, 350px" className="object-cover" />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={t('close')}
            onClick={close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <Icon name="close" />
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={showPrev}
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <Icon name="chevron_left" />
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={showNext}
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <Icon name="chevron_right" />
              </button>
            </>
          )}
          <div className="relative h-full max-h-[90vh] w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image src={images[openIndex] ?? ''} alt={alt} fill sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </>
  );
}
