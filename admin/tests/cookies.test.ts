import { createChunks } from '@supabase/ssr';
import { describe, expect, it } from 'vitest';

import { ACTIVITY_COOKIE, serializeActivity } from '@/lib/session';
import { COOKIE_HEADER_BUDGET, cookieHeaderBytes, supabaseCookies } from '@/lib/supabase/cookie-budget';
import { SESSION_COOKIE_ENCODING } from '@/lib/supabase/cookies';

import { AUTH_COOKIE, type Shape, storedSession } from './fixtures/session-shape';

// Every cookie the panel sets after password + TOTP: the Supabase session and the activity cookie.
const activity = { name: ACTIVITY_COOKIE, value: serializeActivity({ start: 1_800_000_000_000, last: 1_800_000_000_000 }) };
const panelCookies = (shape: Shape) => [
  ...supabaseCookies(AUTH_COOKIE, storedSession(shape, SESSION_COOKIE_ENCODING !== 'tokens-only')),
  activity,
];

describe('Cookie header budget for a signed-in session', () => {
  it('stores only the tokens in the session cookie', () => {
    expect(SESSION_COOKIE_ENCODING).toBe('tokens-only');
  });

  it.each(['typical', 'worst'] as const)('%s session stays under 4 KB', (shape) => {
    const bytes = cookieHeaderBytes(panelCookies(shape));
    expect(bytes, `${shape}: ${bytes} bytes`).toBeLessThanOrEqual(COOKIE_HEADER_BUDGET);
  });

  it('fits the worst case in a single cookie (no chunks)', () => {
    expect(supabaseCookies(AUTH_COOKIE, storedSession('worst', false))).toHaveLength(1);
  });

  it('would not fit if the user object were stored too (why tokens-only)', () => {
    const full = supabaseCookies(AUTH_COOKIE, storedSession('worst', true));
    expect(full.length).toBeGreaterThan(1);
    expect(cookieHeaderBytes([...full, activity])).toBeGreaterThan(COOKIE_HEADER_BUDGET);
  });

  it('keeps the activity cookie to two timestamps', () => {
    expect(activity.value).toMatch(/^\d{13}\.\d{13}$/);
    expect(cookieHeaderBytes([activity])).toBeLessThanOrEqual(40);
  });

  it('uses the same chunk names @supabase/ssr removes when a session shrinks', () => {
    // A larger old cookie was split as .0/.1/.2; the new single cookie uses the bare name,
    // and @supabase/ssr deletes every other chunk-like name on write.
    expect(createChunks(AUTH_COOKIE, 'x'.repeat(4000)).map((c) => c.name)).toEqual([`${AUTH_COOKIE}.0`, `${AUTH_COOKIE}.1`]);
    expect(createChunks(AUTH_COOKIE, 'x').map((c) => c.name)).toEqual([AUTH_COOKIE]);
  });
});
