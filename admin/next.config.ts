import type { NextConfig } from 'next';

import { securityHeaders } from './lib/security-headers';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev server only: lets http://127.0.0.1:3000 use hot reload (the default allows localhost).
  ...(process.env.NODE_ENV === 'development' ? { allowedDevOrigins: ['127.0.0.1'] } : {}),
  // Off on purpose: a nonce-based CSP needs every page rendered per request, which
  // cacheComponents (partial prerendering) and partial prefetching do not allow.
  cacheComponents: false,
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
