import type { NextConfig } from 'next';

import { securityHeaders } from './lib/security-headers';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: [...securityHeaders] }];
  },
};

export default nextConfig;
