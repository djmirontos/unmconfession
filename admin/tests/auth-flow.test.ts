import { describe, expect, it } from 'vitest';

import { afterPassword, type AuthPage, type AuthStateKind, redirectFor } from '@/lib/auth-flow';

const PAGES: AuthPage[] = ['login', 'verify', 'enroll', 'panel'];
const STATES: AuthStateKind[] = ['signed-out', 'needs-enrollment', 'needs-code', 'expired', 'verified'];

describe('afterPassword', () => {
  it('goes to set-up without an authenticator, to the code step with one', () => {
    expect(afterPassword(false)).toBe('/security/enroll');
    expect(afterPassword(true)).toBe('/login/verify');
  });
});

describe('redirectFor', () => {
  it.each<[AuthStateKind, AuthPage, string | null]>([
    // (a) first sign-in, no authenticator yet
    ['needs-enrollment', 'login', '/security/enroll'],
    ['needs-enrollment', 'enroll', null],
    ['needs-enrollment', 'verify', '/security/enroll'],
    ['needs-enrollment', 'panel', '/security/enroll'],
    // (b) authenticator set up, code not entered yet
    ['needs-code', 'login', '/login/verify'],
    ['needs-code', 'verify', null],
    ['needs-code', 'enroll', '/login/verify'],
    ['needs-code', 'panel', '/login/verify'],
    // (c) already at aal2
    ['verified', 'login', '/'],
    ['verified', 'verify', '/'],
    ['verified', 'enroll', '/'],
    ['verified', 'panel', null],
    // signed out / past 12 hours
    ['signed-out', 'login', null],
    ['signed-out', 'verify', '/login'],
    ['signed-out', 'enroll', '/login'],
    ['signed-out', 'panel', '/login'],
    ['expired', 'login', '/auth/expired'],
    ['expired', 'panel', '/auth/expired'],
  ])('%s on %s → %s', (state, page, target) => {
    expect(redirectFor(state, page)).toBe(target);
  });

  it('has exactly one page that renders for every reachable state, and never redirects to itself', () => {
    const pathOf: Record<AuthPage, string> = { login: '/login', verify: '/login/verify', enroll: '/security/enroll', panel: '/' };
    for (const state of STATES) {
      const rendering = PAGES.filter((p) => redirectFor(state, p) === null);
      expect(rendering.length, state).toBeLessThanOrEqual(1);
      for (const page of PAGES) expect(redirectFor(state, page), `${state} on ${page}`).not.toBe(pathOf[page]);
    }
  });

  it('settles every state within two hops (no redirect loops)', () => {
    const pageOf: Record<string, AuthPage> = { '/login': 'login', '/login/verify': 'verify', '/security/enroll': 'enroll', '/': 'panel' };
    for (const state of STATES.filter((s) => s !== 'expired')) {
      for (const start of PAGES) {
        let page: AuthPage = start;
        for (let hop = 0; hop < 2; hop++) {
          const target = redirectFor(state, page);
          if (target === null) break;
          page = pageOf[target];
        }
        expect(redirectFor(state, page), `${state} from ${start}`).toBeNull();
      }
    }
  });
});
