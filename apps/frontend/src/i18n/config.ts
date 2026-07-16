export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Pick a supported locale from an Accept-Language header, defaulting to vi. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const tags = acceptLanguage.split(',').map((p) => p.split(';')[0]!.trim().toLowerCase());
  for (const tag of tags) {
    if (tag.startsWith('vi')) return 'vi';
    if (tag.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}
