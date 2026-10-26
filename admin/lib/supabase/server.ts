import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { serverEnv } from '@/lib/env';
import { hardenCookie, SESSION_COOKIE_ENCODING } from '@/lib/supabase/cookies';
import type { Database } from '@/types/database';

/** Supabase client for Server Components, Server Actions and Route Handlers. One per request. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = serverEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      encode: SESSION_COOKIE_ENCODING,
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, hardenCookie(options));
          }
        } catch {
          // Server Components cannot write cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}
