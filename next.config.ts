import type { NextConfig } from 'next';

// Everything runs in the browser against Supabase, so the site is exported as plain static files.
// Production redirects live in vercel.json (Vercel serves public/poker/index.html at /poker itself);
// next dev only serves the file path, so it gets a redirect here.
const nextConfig: NextConfig = {
  output: 'export',
  experimental: {
    // The dev cache can grow to hundreds of MB; this machine is short on disk space.
    turbopackFileSystemCacheForDev: false,
  },
  ...(process.env.NODE_ENV === 'development' && {
    async redirects() {
      return [{ source: '/poker', destination: '/poker/index.html', permanent: false }];
    },
  }),
};

export default nextConfig;
