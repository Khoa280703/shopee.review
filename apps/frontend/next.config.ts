import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Backend origin for the DEV rewrite only (no nginx in front of `pnpm dev`).
// In prod nginx proxies these same-origin paths, so rewrites() returns [].
const devBackendOrigin = (process.env.API_INTERNAL_URL || 'http://localhost:3066/api').replace(
  /\/api\/?$/,
  '',
);

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Local /uploads images are same-origin (relative) → treated as local by the
    // Next optimizer, no remotePattern needed. Only absolute remote hosts listed.
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'cf.shopee.vn' },
      { protocol: 'https', hostname: 'down-vn.img.susercontent.com' },
      // OAuth provider avatars (Google + Facebook) — captured on social login.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      // Smoke/demo data hosts.
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
  transpilePackages: ['@app/database'],
  // Dev-only proxy so the browser's relative /api, /uploads, /r, /socket.io reach
  // the backend without nginx. Prod serves these via nginx (same origin).
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      { source: '/api/:path*', destination: `${devBackendOrigin}/api/:path*` },
      { source: '/uploads/:path*', destination: `${devBackendOrigin}/uploads/:path*` },
      { source: '/r/:path*', destination: `${devBackendOrigin}/r/:path*` },
      { source: '/socket.io/:path*', destination: `${devBackendOrigin}/socket.io/:path*` },
    ];
  },
};

// withSentryConfig is a no-op for runtime when no DSN is set; source-map upload
// only runs when SENTRY_AUTH_TOKEN + org/project are present.
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
});
