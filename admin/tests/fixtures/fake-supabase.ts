import { vi } from 'vitest';

// A Supabase server client that behaves like the real one with encode: 'tokens-only':
// getSession() returns a session whose `user` throws on any property access (auth-js's
// userNotAvailableProxy), and mfa.getAuthenticatorAssuranceLevel() without a token reads
// session.user.factors, so it throws too. Only getUser() and getClaims() are safe.

export const TOKENS_ONLY_ERROR =
  '@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage.';

export type FakeState = {
  signedIn: boolean;
  factors: { id: string; factor_type: string; status: string }[];
  aal: 'aal1' | 'aal2';
  passwordAtMs: number;
  isStaff: boolean;
  isAdmin: boolean;
};

export const USER_ID = '0b6f3c2e-9a41-4f7d-8c55-2f1e7a9d3b10';
export const FACTOR_ID = '6d1c8a4e-2b3f-4c5d-9e8f-0a1b2c3d4e5f';

function placeholderUser(): object {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`${TOKENS_ONLY_ERROR} Accessing the "${String(prop)}" property of the session object is not supported.`);
      },
    },
  );
}

export function fakeClient(state: FakeState) {
  const session = state.signedIn ? { access_token: 'token', user: placeholderUser() } : null;
  const getSession = vi.fn(async () => ({ data: { session }, error: null }));
  return {
    auth: {
      getUser: vi.fn(async () =>
        state.signedIn
          ? { data: { user: { id: USER_ID, factors: state.factors } }, error: null }
          : { data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } },
      ),
      getClaims: vi.fn(async () =>
        state.signedIn
          ? {
              data: {
                claims: { sub: USER_ID, aal: state.aal, amr: [{ method: 'password', timestamp: Math.floor(state.passwordAtMs / 1000) }] },
              },
              error: null,
            }
          : { data: null, error: null },
      ),
      getSession,
      mfa: {
        // Same as auth-js without a jwt argument.
        getAuthenticatorAssuranceLevel: vi.fn(async () => {
          const { data } = await getSession();
          const user = data.session?.user as { factors?: unknown[] } | undefined;
          return { data: { currentLevel: state.aal, nextLevel: user?.factors?.length ? 'aal2' : state.aal }, error: null };
        }),
      },
    },
    rpc: vi.fn(async (fn: string) => ({ data: fn === 'is_staff' ? state.isStaff : state.isAdmin, error: null })),
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'profiles' ? { nickname: 'mod_santos' } : { role: state.isAdmin ? 'admin' : 'moderator' },
            error: null,
          }),
        }),
      }),
    })),
  };
}
