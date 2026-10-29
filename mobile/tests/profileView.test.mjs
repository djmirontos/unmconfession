// Run with: npm run test:profile  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getProfileViewState, isValidUserId } from '../lib/profileView.ts';

const member = { nickname: 'juan.dc' };
const deleted = { nickname: null };
const base = { isGuest: false, isSelf: false, profile: member, blockedByMe: false };

test('isValidUserId accepts UUIDs in either case', () => {
  assert.equal(isValidUserId('3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b'), true);
  assert.equal(isValidUserId('3F1C2A9E-7B6D-4E21-9A0B-5C4D3E2F1A0B'), true);
});

test('isValidUserId rejects everything else', () => {
  for (const id of [
    '',
    'abc',
    '3f1c2a9e7b6d4e219a0b5c4d3e2f1a0b',
    '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0',
    '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0bb',
    'zf1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b',
    ' 3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b',
    '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b\n',
    "3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b' or 1=1",
    null,
    undefined,
    42,
    ['3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b'],
  ]) {
    assert.equal(isValidUserId(id), false, JSON.stringify(id));
  }
});

test('a guest sees the sign-in prompt, whatever the profile', () => {
  assert.equal(getProfileViewState({ ...base, isGuest: true }), 'guest');
  assert.equal(getProfileViewState({ ...base, isGuest: true, profile: null }), 'guest');
  assert.equal(getProfileViewState({ ...base, isGuest: true, blockedByMe: true }), 'guest');
});

test('your own id goes to the Profile tab', () => {
  assert.equal(getProfileViewState({ ...base, isSelf: true }), 'self');
});

test('no profile row is missing', () => {
  assert.equal(getProfileViewState({ ...base, profile: null }), 'missing');
  assert.equal(getProfileViewState({ ...base, profile: null, blockedByMe: true }), 'missing');
});

test('a null nickname is a deleted account, even if blocked', () => {
  assert.equal(getProfileViewState({ ...base, profile: deleted }), 'deleted');
  assert.equal(getProfileViewState({ ...base, profile: deleted, blockedByMe: true }), 'deleted');
});

test('blocked by me hides the posts', () => {
  assert.equal(getProfileViewState({ ...base, blockedByMe: true }), 'blocked');
});

test('otherwise the profile shows', () => {
  assert.equal(getProfileViewState(base), 'ok');
});
