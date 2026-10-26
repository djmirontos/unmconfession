// Response headers for every route (next.config.ts). The Content-Security-Policy is set per
// request by proxy.ts because it carries a fresh nonce.
export const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Not 'no-referrer': under that policy browsers send `Origin: null` on same-origin form POSTs,
  // and Next.js's Server Actions CSRF check (Origin must match the host) rejects every action.
  // 'same-origin' keeps the Origin for our own requests and still sends no referrer to other sites.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
] as const;
