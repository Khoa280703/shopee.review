import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/components/providers/query-provider';
import { SocketProvider } from '@/components/providers/socket-provider';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/constants';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });

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
      <body className={`${inter.className} bg-background text-on-background`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <QueryProvider>
              <AuthProvider>
                <SocketProvider>
                  {/* Top header — only on mobile/tablet */}
                  <Header />
                  {/* Desktop left sidebar */}
                  <SidebarNav />
                  {/* Main content — shifted right on desktop to clear the fixed sidebar */}
                  <main className="min-h-screen pb-20 lg:ml-[72px] lg:pb-10">{children}</main>
                  {/* Bottom nav — only on mobile */}
                  <MobileNav />
                </SocketProvider>
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
