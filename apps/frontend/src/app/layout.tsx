import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
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
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'vi_VN' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className={`${inter.className} bg-background text-on-background`}>
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
      </body>
    </html>
  );
}
