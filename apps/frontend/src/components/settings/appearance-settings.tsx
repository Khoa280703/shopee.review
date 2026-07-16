'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { setLocale } from '@/i18n/actions';
import { LOCALES, type Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';

const THEMES = ['light', 'dark', 'system'] as const;

export function AppearanceSettings() {
  const t = useTranslations('settings');
  const { theme, setTheme } = useTheme();
  const activeLocale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // next-themes only knows the resolved theme after mount; render a stable value
  // first to avoid a hydration mismatch on the active pill.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function changeLocale(next: Locale) {
    if (next === activeLocale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  const pill = (active: boolean) =>
    cn(
      'rounded-full border px-4 py-1.5 text-body-sm font-medium transition',
      active
        ? 'border-primary bg-primary text-on-primary'
        : 'border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-high',
    );

  return (
    <section className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="font-headline-md text-headline-md text-on-surface">{t('appearance')}</h2>

      <div>
        <p className="mb-2 text-body-sm font-medium text-on-surface-variant">{t('theme')}</p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setTheme(th)}
              className={pill(mounted && theme === th)}
            >
              {t(th === 'light' ? 'themeLight' : th === 'dark' ? 'themeDark' : 'themeSystem')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-on-surface-variant">{t('language')}</p>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((lc) => (
            <button
              key={lc}
              type="button"
              disabled={pending}
              onClick={() => changeLocale(lc)}
              className={pill(activeLocale === lc)}
            >
              {t(lc === 'vi' ? 'languageVi' : 'languageEn')}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
