import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const apiUrlStr = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3066/api';
const isAbsoluteUrl = /^https?:\/\//.test(apiUrlStr);
const apiUrl = isAbsoluteUrl ? new URL(apiUrlStr) : new URL('http://localhost:3066/api');
const apiProtocol = apiUrl.protocol.replace(':', '') as 'http' | 'https';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // Only add uploads pattern when API URL is absolute (has explicit hostname)
      ...(isAbsoluteUrl ? [{ protocol: apiProtocol, hostname: apiUrl.hostname, port: apiUrl.port, pathname: '/uploads/**' }] : []),
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'cf.shopee.vn' },
      { protocol: 'https', hostname: 'down-vn.img.susercontent.com' },
      // Smoke/demo data hosts.
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
  transpilePackages: ['@app/database'],
};

// withSentryConfig is a no-op for runtime when no DSN is set; source-map upload
// only runs when SENTRY_AUTH_TOKEN + org/project are present.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
});
