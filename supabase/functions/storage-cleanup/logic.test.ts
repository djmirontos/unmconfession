// Run with: node --test supabase/functions/storage-cleanup/logic.test.ts  (Node 22.6+ strips the types)
// Deno can run the same file: deno test supabase/functions/storage-cleanup/logic.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chunk,
  constantTimeEqual,
  countByBucket,
  groupByBucket,
  isAllowedPath,
  parseBatch,
  parseDryRun,
} from './logic.ts';

const U = '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b';

test('isAllowedPath accepts the two exact shapes', () => {
  assert.equal(isAllowedPath('avatars', `${U}/c_0123456789ab.jpg`), true);
  assert.equal(isAllowedPath('post-images', `${U}/9b2f6c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f.jpg`), true);
  assert.equal(isAllowedPath('post-images', `${U}/photo_1-a.jpg`), true);
});

test('isAllowedPath refuses wrong buckets', () => {
  assert.equal(isAllowedPath('announcements', `${U}/c_0123456789ab.jpg`), false);
  assert.equal(isAllowedPath('', `${U}/x.jpg`), false);
  assert.equal(isAllowedPath('Avatars', `${U}/c_0123456789ab.jpg`), false);
});

test('isAllowedPath refuses ".." and extra segments', () => {
  assert.equal(isAllowedPath('post-images', `${U}/..`), false);
  assert.equal(isAllowedPath('post-images', `${U}/a..jpg`), false);
  assert.equal(isAllowedPath('post-images', `${U}/sub/x.jpg`), false);
  assert.equal(isAllowedPath('post-images', `../${U}/x.jpg`), false);
  assert.equal(isAllowedPath('post-images', `${U}/`), false);
});

test('isAllowedPath refuses a wrong avatar name', () => {
  assert.equal(isAllowedPath('avatars', `${U}/avatar_01.jpg`), false);
  assert.equal(isAllowedPath('avatars', `${U}/c_0123456789AB.jpg`), false);
  assert.equal(isAllowedPath('avatars', `${U}/c_0123456789a.jpg`), false);
  assert.equal(isAllowedPath('avatars', `${U}/c_0123456789ab.png`), false);
});

test('isAllowedPath refuses an uppercase or malformed uuid folder', () => {
  assert.equal(isAllowedPath('avatars', `${U.toUpperCase()}/c_0123456789ab.jpg`), false);
  assert.equal(isAllowedPath('post-images', `${U.toUpperCase()}/x.jpg`), false);
  assert.equal(isAllowedPath('post-images', 'not-a-uuid/x.jpg'), false);
});

test('isAllowedPath refuses a file name longer than 120 characters', () => {
  assert.equal(isAllowedPath('post-images', `${U}/${'a'.repeat(120)}`), true);
  assert.equal(isAllowedPath('post-images', `${U}/${'a'.repeat(121)}`), false);
});

test('chunk splits into pieces of at most the size', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2], 100), [[1, 2]]);
  assert.deepEqual(chunk([], 100), []);
  assert.equal(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length).join(','), '100,100,50');
  assert.throws(() => chunk([1], 0), RangeError);
});

test('groupByBucket keeps the order inside each bucket', () => {
  const rows = [
    { id: 1, bucket: 'avatars', path: 'a' },
    { id: 2, bucket: 'post-images', path: 'b' },
    { id: 3, bucket: 'avatars', path: 'c' },
  ];
  const groups = groupByBucket(rows);
  assert.deepEqual([...groups.keys()], ['avatars', 'post-images']);
  assert.deepEqual(groups.get('avatars')?.map((r) => r.id), [1, 3]);
  assert.deepEqual(groups.get('post-images')?.map((r) => r.id), [2]);
  assert.equal(groupByBucket([]).size, 0);
});

test('countByBucket counts the allowed rows and skips the rest', () => {
  assert.deepEqual(
    countByBucket([
      { id: 1, bucket: 'avatars', path: `${U}/c_0123456789ab.jpg` },
      { id: 2, bucket: 'post-images', path: `${U}/x.jpg` },
      { id: 3, bucket: 'post-images', path: `${U}/../x.jpg` },
    ]),
    { avatars: 1, postImages: 1, skipped: 1 },
  );
});

test('constantTimeEqual: equal, different, different length', () => {
  assert.equal(constantTimeEqual('s3cret-value', 's3cret-value'), true);
  assert.equal(constantTimeEqual('s3cret-value', 's3cret-valuf'), false);
  assert.equal(constantTimeEqual('s3cret-value', 's3cret-valu'), false);
  assert.equal(constantTimeEqual('s3cret', 's3cret-value'), false);
  assert.equal(constantTimeEqual('', 'x'), false);
  assert.equal(constantTimeEqual('', ''), true);
  assert.equal(constantTimeEqual('é', 'e'), false);
});

test('parseDryRun: live only for exactly "false"', () => {
  assert.equal(parseDryRun('false'), false);
  for (const v of [undefined, null, '', 'true', 'False', 'FALSE', ' false', 'false ', '0', 'no', 'off']) {
    assert.equal(parseDryRun(v), true, `value ${JSON.stringify(v)}`);
  }
});

test('parseBatch clamps to 1..200 with a default of 100', () => {
  assert.equal(parseBatch(undefined), 100);
  assert.equal(parseBatch(''), 100);
  assert.equal(parseBatch('abc'), 100);
  assert.equal(parseBatch('50'), 50);
  assert.equal(parseBatch('0'), 1);
  assert.equal(parseBatch('-7'), 1);
  assert.equal(parseBatch('1000'), 200);
  assert.equal(parseBatch('200'), 200);
});
