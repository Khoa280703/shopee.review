import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './config';

// No URL-based routing: the active locale comes from the NEXT_LOCALE cookie
// (set by the language switcher). On first visit (no cookie) we negotiate from
// the browser's Accept-Language, defaulting to Vietnamese.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale)
    ? cookieLocale
    : negotiateLocale((await headers()).get('accept-language')) || DEFAULT_LOCALE;

  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
