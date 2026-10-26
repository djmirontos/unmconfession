import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type FakeState, FACTOR_ID, fakeClient, TOKENS_ONLY_ERROR } from './fixtures/fake-supabase';

// Renders the real sign-in pages and runs requireStaff() against a fake Supabase client that
// throws exactly like tokens-only cookies do when the session's user is touched.

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

let client: ReturnType<typeof fakeClient>;

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  usePathname: () => '/',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

const base: FakeState = {
  signedIn: true,
  factors: [],
  aal: 'aal1',
  passwordAtMs: Date.now() - 60_000,
  isStaff: true,
  isAdmin: false,
};
const verifiedFactor = { id: FACTOR_ID, factor_type: 'totp', status: 'verified' };

async function render(load: () => Promise<{ default: () => Promise<React.ReactElement> }>) {
  const { default: Page } = await load();
  try {
    return { html: renderToStaticMarkup(await Page()), redirect: null };
  } catch (e) {
    if (e instanceof RedirectSignal) return { html: null, redirect: e.url };
    throw e;
  }
}

const enrollPage = () => import('@/app/(auth)/security/enroll/page');
const verifyPage = () => import('@/app/(auth)/login/verify/page');

beforeEach(() => {
  client = fakeClient(base);
});

describe('fake client fidelity', () => {
  it('throws like tokens-only when the old assurance-level call is used', async () => {
    await expect(client.auth.mfa.getAuthenticatorAssuranceLevel()).rejects.toThrow(TOKENS_ONLY_ERROR);
  });
});

describe('/security/enroll', () => {
  it('renders after the password step (no authenticator yet) without touching the session user', async () => {
    const result = await render(enrollPage);
    expect(result.redirect).toBeNull();
    expect(result.html).toContain('Set up your authenticator');
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it('sends a user with an authenticator to the code step', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor] });
    expect((await render(enrollPage)).redirect).toBe('/login/verify');
  });

  it('ignores unverified factors (an abandoned set-up)', async () => {
    client = fakeClient({ ...base, factors: [{ ...verifiedFactor, status: 'unverified' }] });
    expect((await render(enrollPage)).redirect).toBeNull();
  });

  it('sends signed-out visitors to /login', async () => {
    client = fakeClient({ ...base, signedIn: false });
    expect((await render(enrollPage)).redirect).toBe('/login');
  });
});

describe('/login/verify', () => {
  it('renders the code form for aal1 with a verified factor', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor] });
    const result = await render(verifyPage);
    expect(result.redirect).toBeNull();
    expect(result.html).toContain('Enter your authenticator code');
  });

  it('sends an aal2 session to the dashboard', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor], aal: 'aal2' });
    expect((await render(verifyPage)).redirect).toBe('/');
  });

  it('signs out a session past 12 hours', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor], passwordAtMs: Date.now() - 13 * 3_600_000 });
    expect((await render(verifyPage)).redirect).toBe('/auth/expired');
  });
});

describe('requireStaff()', () => {
  const run = async () => {
    const { requireStaff } = await import('@/lib/auth');
    try {
      return { ctx: await requireStaff(), redirect: null };
    } catch (e) {
      if (e instanceof RedirectSignal) return { ctx: null, redirect: e.url };
      throw e;
    }
  };

  it('lets an aal2 moderator in', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor], aal: 'aal2' });
    const { ctx } = await run();
    expect(ctx).toMatchObject({ nickname: 'mod_santos', role: 'moderator', isAdmin: false });
  });

  it('refuses aal1 even for staff', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor], aal: 'aal1' });
    expect((await run()).redirect).toBe('/login/verify');
  });

  it('refuses an aal2 account that is no longer staff', async () => {
    client = fakeClient({ ...base, factors: [verifiedFactor], aal: 'aal2', isStaff: false });
    expect((await run()).redirect).toBe('/403');
  });
});
