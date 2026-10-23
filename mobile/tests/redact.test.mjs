// Run with: npm run test:redact  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { redact, redactString, uriScheme } from '../lib/redact.ts';

test('masks email addresses', () => {
  assert.equal(redactString('signup failed for juan.dela.cruz@unm.edu.ph'), 'signup failed for j***@unm.edu.ph');
});

test('hides JWTs, bearer headers and Supabase keys', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
  assert.equal(redactString(`token ${jwt}`), 'token [jwt]');
  assert.equal(redactString('Authorization: Bearer abc.def-123'), 'Authorization: Bearer [redacted]');
  assert.equal(redactString('key sb_publishable_AbC123_x'), 'key sb_publishable_[redacted]');
});

test('replaces secret-looking keys at any depth', () => {
  const input = {
    password: 'hunter22',
    otp: '123456',
    nested: { access_token: 'x', refresh_token: 'y', apikey: 'z', Authorization: 'Bearer q', session: { a: 1 } },
    code: 'storage_error',
    email: 'a.b@c.com',
  };
  assert.deepEqual(redact(input), {
    password: '[redacted]',
    otp: '[redacted]',
    nested: {
      access_token: '[redacted]',
      refresh_token: '[redacted]',
      apikey: '[redacted]',
      Authorization: '[redacted]',
      session: '[redacted]',
    },
    code: 'storage_error',
    email: 'a***@c.com',
  });
  assert.equal(input.password, 'hunter22', 'input is not mutated');
});

test('keeps error codes, statuses and paths', () => {
  const report = { statusCode: '403', error: 'Unauthorized', path: '6f1c/abc.jpg', status: 400 };
  assert.deepEqual(redact(report), report);
});

test('uriScheme logs only the scheme', () => {
  assert.equal(uriScheme('file:///data/user/0/host.exp.exponent/cache/x.jpg'), 'file:');
  assert.equal(uriScheme('content://media/external/images/1'), 'content:');
  assert.equal(uriScheme('/no/scheme'), '(none)');
});
