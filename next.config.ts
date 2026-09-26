import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // The dev cache can grow to hundreds of MB; this machine is short on disk space.
    turbopackFileSystemCacheForDev: false,
  },
  async redirects() {
    // Royal Poker is a static app served from /public/poker (same origin => shared login session).
    return [{ source: '/poker', destination: '/poker/index.html', permanent: false }];
  },
};

export default nextConfig;
