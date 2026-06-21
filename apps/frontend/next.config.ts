import type { NextConfig } from 'next';

const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3066/api');
const apiProtocol = apiUrl.protocol.replace(':', '') as 'http' | 'https';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: apiProtocol, hostname: apiUrl.hostname, port: apiUrl.port, pathname: '/uploads/**' },
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'cf.shopee.vn' },
      { protocol: 'https', hostname: 'down-vn.img.susercontent.com' },
    ],
  },
  transpilePackages: ['@app/database'],
};

export default nextConfig;
