import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVITY_COOKIE } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

// Server Components cannot clear cookies, so requireStaff() sends a session past its
// 12-hour limit here to be signed out. Signing out is the only effect.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(ACTIVITY_COOKIE);
  return NextResponse.redirect(new URL('/login?reason=expired', request.url));
}
