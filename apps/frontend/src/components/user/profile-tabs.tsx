'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type ProfileTab = 'posts' | 'products';

export function ProfileTabs({ active }: { active: ProfileTab }) {
  const t = useTranslations('profile');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const TABS: { id: ProfileTab; label: string }[] = [
    { id: 'posts', label: t('tabPosts') },
    { id: 'products', label: t('tabProducts') },
  ];

  function goTab(tab: ProfileTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'posts') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  return (
    <div className="flex border-y border-outline-variant bg-surface-container-lowest sm:overflow-hidden sm:rounded-xl sm:border sm:shadow-card">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => goTab(t.id)}
          className={cn(
            'relative flex-1 py-md font-headline-md text-headline-md transition-colors',
            active === t.id
              ? 'font-bold text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-low',
          )}
        >
          {t.label}
          {active === t.id && (
            <span className="absolute bottom-0 left-0 h-1 w-full rounded-t-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
