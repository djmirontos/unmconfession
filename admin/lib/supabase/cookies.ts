import type { CookieOptions } from '@supabase/ssr';

/**
 * Only the tokens go into the session cookie; auth-js keeps the user object in per-request
 * memory. The panel never reads the session's user (it always calls getUser()), and the full user
 * (identities, metadata, factors) would push the Cookie header to ~9 KB in the worst case
 * (see tests/cookies.test.ts). Old chunks from a larger cookie are removed on the next write.
 */
export const SESSION_COOKIE_ENCODING = 'tokens-only' as const;

/**
 * Every cookie this app writes. No browser code reads the session, so auth cookies are
 * httpOnly too (@supabase/ssr leaves them readable by default for its browser client).
 */
export function hardenCookie(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}
