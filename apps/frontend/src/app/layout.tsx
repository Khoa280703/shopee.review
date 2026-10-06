import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { NotificationsProvider } from '@/components/providers/notifications-provider';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/components/providers/query-provider';
import { SocketProvider } from '@/components/providers/socket-provider';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/constants';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });

// Material Symbols Outlined icon font. `next/font/google` can't subset an
// icon-ligature font by icon name, so this loads via a real <link> (discovered
// by the browser's preload scanner directly in the HTML, unlike the old
// `@import` buried inside globals.css, which blocks the rest of that
// stylesheet until it resolves) instead of next/font. Three axis values are
// pinned to what every icon in this app actually renders at (opsz 24, wght
// 400, GRAD 0); FILL stays a 0..1 range since the `fill` prop toggles it live.
// `icon_names` restricts the download to the <40 glyphs actually used instead
// of the full multi-MB variable-font file (FE audit H4). `display=block`
// keeps the ligature text (e.g. literally "home") invisible instead of
// flashing as plain text while the font loads.
const MATERIAL_SYMBOLS_ICON_NAMES = [
  'account_circle', 'add', 'add_circle', 'ads_click', 'bookmark', 'chat_bubble',
  'chevron_left', 'chevron_right', 'close', 'delete', 'expand_more', 'favorite',
  'flag', 'home', 'image', 'link', 'logout', 'monitoring', 'notifications',
  'open_in_new', 'person', 'person_add', 'post_add', 'search', 'sell',
  'settings', 'share', 'shield', 'shopping_bag', 'shopping_cart', 'star',
  'star_half', 'storefront', 'subdirectory_arrow_right', 'verified',
].join(',');
const MATERIAL_SYMBOLS_URL =
  `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0` +
  `&icon_names=${MATERIAL_SYMBOLS_ICON_NAMES}&display=block`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - MXH Review Sản Phẩm Shopee`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'vi_VN',
    url: '/',
    title: `${SITE_NAME} - MXH Review Sản Phẩm Shopee`,
    description: SITE_DESCRIPTION,
  },
  // summary_large_image so shared links render a big preview card (growth loop).
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} - MXH Review Sản Phẩm Shopee`,
    description: SITE_DESCRIPTION,
  },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={MATERIAL_SYMBOLS_URL} />
      </head>
      <body className={`${inter.className} bg-background text-on-background`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <ToastProvider>
            <QueryProvider>
              <AuthProvider>
                <SocketProvider>
                  <NotificationsProvider>
                    {/* Top header — only on mobile/tablet */}
                    <Header />
                    {/* Desktop left sidebar */}
                    <SidebarNav />
                    {/* Main content — shifted right on desktop to clear the fixed sidebar */}
                    <main className="min-h-screen pb-20 lg:ml-[72px] lg:pb-10">{children}</main>
                    {/* Bottom nav — only on mobile */}
                    <MobileNav />
                  </NotificationsProvider>
                </SocketProvider>
              </AuthProvider>
            </QueryProvider>
            </ToastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
