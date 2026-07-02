'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { Category } from '@/types';

interface Props {
  categories: Category[];
  activeSlug?: string;
}

export function CategoryPills({ categories, activeSlug }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Link
        href="/"
        className={cn(
          'whitespace-nowrap rounded-full border px-4 py-1.5 text-body-sm font-medium transition',
          !activeSlug
            ? 'border-primary bg-primary text-on-primary'
            : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high',
        )}
      >
        Tất cả
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.slug}`}
          className={cn(
            'whitespace-nowrap rounded-full border px-4 py-1.5 text-body-sm font-medium transition',
            activeSlug === c.slug
              ? 'border-primary bg-primary text-on-primary'
              : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high',
          )}
        >
          {c.icon} {c.name}
        </Link>
      ))}
    </div>
  );
}
