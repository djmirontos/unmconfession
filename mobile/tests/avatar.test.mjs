// Run with: npm run test:avatar  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { getRandomValues } from 'node:crypto';
import { test } from 'node:test';

import { avatarFilePath, avatarFilesToDelete, avatarUrl, isCustomAvatarKey, newAvatarKey } from '../lib/avatar.ts';

const UID = '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b';
const BASE = 'https://abc.supabase.co';
const random = (n) => getRandomValues(new Uint8Array(n));

test('isCustomAvatarKey accepts exactly c_ + 12 lowercase hex', () => {
  for (const key of ['c_0123456789ab', 'c_ffffffffffff', 'c_000000000000']) assert.equal(isCustomAvatarKey(key), true, key);
});

test('isCustomAvatarKey rejects presets and malformed keys', () => {
  for (const key of [
    'avatar_01',
    'em_panda',
    'c_0123456789a',
    'c_0123456789abc',
    'c_0123456789AB',
    'c_0123456789ag',
    'C_0123456789ab',
    ' c_0123456789ab',
    'c_0123456789ab\n',
    'c_0123456789ab.jpg',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isCustomAvatarKey(key), false, JSON.stringify(key));
  }
});

test('avatarFilePath and avatarUrl build the public bucket path', () => {
  assert.equal(avatarFilePath(UID, 'c_0123456789ab'), `${UID}/c_0123456789ab.jpg`);
  assert.equal(
    avatarUrl(UID, 'c_0123456789ab', BASE),
    `${BASE}/storage/v1/object/public/avatars/${UID}/c_0123456789ab.jpg`,
  );
  assert.equal(avatarUrl(UID, 'c_0123456789ab', `${BASE}/`), `${BASE}/storage/v1/object/public/avatars/${UID}/c_0123456789ab.jpg`);
});

test('avatarUrl is null for presets, unknown authors or no base URL', () => {
  assert.equal(avatarUrl(UID, 'avatar_01', BASE), null);
  assert.equal(avatarUrl(UID, null, BASE), null);
  assert.equal(avatarUrl(null, 'c_0123456789ab', BASE), null);
  assert.equal(avatarUrl('', 'c_0123456789ab', BASE), null);
  assert.equal(avatarUrl(UID, 'c_0123456789ab', ''), null);
});

test('newAvatarKey makes valid, different keys', () => {
  const keys = new Set(Array.from({ length: 200 }, () => newAvatarKey(random)));
  assert.equal(keys.size, 200);
  for (const key of keys) assert.equal(isCustomAvatarKey(key), true, key);
  assert.equal(newAvatarKey(() => new Uint8Array([0, 1, 0xab, 0xcd, 0xef, 0xff])), 'c_0001abcdefff');
  assert.throws(() => newAvatarKey(() => new Uint8Array(5)));
});

test('avatarFilesToDelete keeps only the current custom picture', () => {
  const files = ['c_aaaaaaaaaaaa.jpg', 'c_bbbbbbbbbbbb.jpg', 'c_cccccccccccc.jpg'];
  assert.deepEqual(avatarFilesToDelete(files, 'c_bbbbbbbbbbbb'), ['c_aaaaaaaaaaaa.jpg', 'c_cccccccccccc.jpg']);
  assert.deepEqual(avatarFilesToDelete(files, 'avatar_03'), files);
  assert.deepEqual(avatarFilesToDelete(files, null), files);
  assert.deepEqual(avatarFilesToDelete([], 'c_bbbbbbbbbbbb'), []);
});

test('avatarFilesToDelete never touches files that are not custom pictures', () => {
  assert.deepEqual(avatarFilesToDelete(['.emptyFolderPlaceholder', 'notes.txt', 'c_aaaaaaaaaaaa.png', 'c_dddddddddddd.jpg'], null), [
    'c_dddddddddddd.jpg',
  ]);
});
