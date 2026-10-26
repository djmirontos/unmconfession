import type { NextRequest } from 'next/server';

import { buildCsp, createNonce } from '@/lib/csp';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.SUPABASE_URL,
    isDev: process.env.NODE_ENV === 'development',
  });
  return updateSession(request, nonce, csp);
}

export const config = {
  matcher: [
    // Pages and Server Actions; not static files, icons, images, prefetches or Next's
    // dev-only /__nextjs_* endpoints (the error overlay expects JSON from them, not a redirect).
    {
      source: '/((?!_next/static|_next/image|__nextjs|.*\\.(?:svg|png|ico|txt|webmanifest)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
