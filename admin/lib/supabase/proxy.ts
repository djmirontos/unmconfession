import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { accessFor } from '@/lib/access';
import { serverEnv } from '@/lib/env';
import {
  ACTIVITY_COOKIE,
  ACTIVITY_COOKIE_MAX_AGE_S,
  checkActivity,
  parseActivity,
  serializeActivity,
} from '@/lib/session';
import { COOKIE_HEADER_WARN } from '@/lib/supabase/cookie-budget';
import { hardenCookie, SESSION_COOKIE_ENCODING } from '@/lib/supabase/cookies';
import type { Database } from '@/types/database';

/**
 * Proxy step: refresh the Supabase session cookies, enforce the idle and absolute limits,
 * and send signed-out visitors to /login. Not the security gate: every page and action
 * checks access again on the server (requireStaff / requireAdmin) and the RPCs check roles.
 */
/** Development aid for HTTP 431: the size of the incoming Cookie header and the cookie NAMES (never values). */
function warnLargeCookieHeader(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return;
  const size = Buffer.byteLength(request.headers.get('cookie') ?? '');
  if (size <= COOKIE_HEADER_WARN) return;
  const names = request.cookies.getAll().map((c) => c.name).join(', ');
  console.warn(`[proxy] Cookie header is ${size} bytes (limit for the panel ${COOKIE_HEADER_WARN}). Cookies: ${names}`);
}

export async function updateSession(request: NextRequest, nonce: string, csp: string): Promise<NextResponse> {
  warnLargeCookieHeader(request);
  const forwardHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    return headers;
  };
  let response = NextResponse.next({ request: { headers: forwardHeaders() } });
  const noStore: Record<string, string> = {};

  const { url, anonKey } = serverEnv();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      encode: SESSION_COOKIE_ENCODING,
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: forwardHeaders() } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenCookie(options));
        }
        Object.assign(noStore, headers);
      },
    },
  });

  // Nothing between creating the client and this call: it refreshes an expired access token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const pathname = request.nextUrl.pathname;

  const finish = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    for (const [key, value] of Object.entries(noStore)) res.headers.set(key, value);
    return res;
  };
  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!signedIn) {
    if (accessFor(pathname) !== 'public') return finish(redirectTo('/login'));
    return finish(response);
  }

  const activity = checkActivity(parseActivity(request.cookies.get(ACTIVITY_COOKIE)?.value), Date.now());
  if (activity.kind === 'expired') {
    // 'local' revokes only this browser's session; the person stays signed in on the app.
    await supabase.auth.signOut({ scope: 'local' });
    const redirect = redirectTo(`/login?reason=${activity.reason}`);
    redirect.cookies.delete(ACTIVITY_COOKIE);
    return finish(redirect);
  }

  response.cookies.set(
    ACTIVITY_COOKIE,
    serializeActivity(activity.next),
    hardenCookie({ maxAge: ACTIVITY_COOKIE_MAX_AGE_S }),
  );
  return finish(response);
}
