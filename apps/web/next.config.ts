import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@nova/shared'],
  async rewrites() {
    const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
