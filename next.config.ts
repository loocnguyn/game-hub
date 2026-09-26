import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    // Royal Poker is a static app served from /public/poker (same origin => shared login session).
    return [{ source: '/poker', destination: '/poker/index.html', permanent: false }];
  },
};

export default nextConfig;
