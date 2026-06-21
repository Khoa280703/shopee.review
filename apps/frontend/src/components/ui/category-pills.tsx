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
          'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition',
          !activeSlug
            ? 'border-orange-500 bg-orange-500 text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300',
        )}
      >
        Tất cả
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.slug}`}
          className={cn(
            'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition',
            activeSlug === c.slug
              ? 'border-orange-500 bg-orange-500 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300',
          )}
        >
          {c.icon} {c.name}
        </Link>
      ))}
    </div>
  );
}
