// Run with: npm run test:session  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isForcedSignOut, isRetryableAuthError, restoreOutcome } from '../lib/sessionRules.ts';

// Shapes of the errors @supabase/auth-js returns.
const networkError = Object.assign(new Error('Network request failed'), { name: 'AuthRetryableFetchError', status: 0 });
const gatewayError = Object.assign(new Error('HTTP 503'), { name: 'AuthRetryableFetchError', status: 503 });
const invalidRefresh = Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), {
  name: 'AuthApiError',
  status: 400,
  code: 'refresh_token_not_found',
});
const sessionMissing = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError', status: 400 });

test('network, timeout and gateway errors are retryable', () => {
  assert.equal(isRetryableAuthError(networkError), true);
  assert.equal(isRetryableAuthError(gatewayError), true);
});

test('a rejected refresh token and everything else are not retryable', () => {
  for (const error of [invalidRefresh, sessionMissing, new Error('boom'), null, undefined, 'AuthRetryableFetchError', {}]) {
    assert.equal(isRetryableAuthError(error), false, String(error));
  }
});

test('launch: a restored session is used as is', () => {
  assert.equal(restoreOutcome(true, null), 'session');
  assert.equal(restoreOutcome(true, networkError), 'session');
});

test('launch: a network failure while refreshing keeps the person signed in', () => {
  assert.equal(restoreOutcome(false, networkError), 'keep-stored');
  assert.equal(restoreOutcome(false, gatewayError), 'keep-stored');
});

test('launch: no stored session, or a rejected refresh token, means a guest', () => {
  assert.equal(restoreOutcome(false, null), 'guest');
  assert.equal(restoreOutcome(false, invalidRefresh), 'guest');
  assert.equal(restoreOutcome(false, sessionMissing), 'guest');
});

test('only an unrequested SIGNED_OUT of a signed-in person is forced', () => {
  assert.equal(isForcedSignOut('SIGNED_OUT', true, false), true);
  assert.equal(isForcedSignOut('SIGNED_OUT', true, true), false); // Log out, delete account
  assert.equal(isForcedSignOut('SIGNED_OUT', false, false), false); // already a guest
  for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY']) {
    assert.equal(isForcedSignOut(event, true, false), false, event);
  }
});
