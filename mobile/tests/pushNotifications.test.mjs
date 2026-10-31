// Run with: npm run test:push  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

import {
  decidePushAsk,
  EMPTY_ASK_MEMORY,
  hasRuntimePrompt,
  MAX_EXPLAINER_ASKS,
  parseAskMemory,
  permissionBanner,
} from '../lib/pushPermission.ts';

// lib/pushNotifications.ts imports '@/lib/notificationTarget' (tsconfig paths).
register('./aliasHook.mjs', import.meta.url);
const { parsePushData, pushDestination, pushGroupKey, PUSH_TYPES } = await import('../lib/pushNotifications.ts');
const { notificationDestination } = await import('../lib/notificationTarget.ts');

const NID = '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b';
const TID = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const PARENT = '00000000-0000-4000-8000-000000000001';
const valid = (over = {}) => ({ nid: NID, type: 'comment', targetType: 'post', targetId: TID, ...over });

// ---------------------------------------------------------------- parsePushData

test('parsePushData accepts a valid payload and ignores extra fields', () => {
  assert.deepEqual(parsePushData(valid({ extra: 'x', title: 'hi' })), { nid: NID, type: 'comment', targetType: 'post', targetId: TID });
  assert.equal(parsePushData(valid({ nid: NID.toUpperCase() })).nid, NID);
});

test('parsePushData refuses a wrong type or target type', () => {
  assert.equal(parsePushData(valid({ type: 'like' })), null);
  assert.equal(parsePushData(valid({ type: 7 })), null);
  assert.equal(parsePushData(valid({ targetType: 'profile' })), null);
});

test('parsePushData refuses bad uuids', () => {
  assert.equal(parsePushData(valid({ nid: 'not-a-uuid' })), null);
  assert.equal(parsePushData(valid({ targetId: '123' })), null);
  assert.equal(parsePushData(valid({ nid: `${NID}x` })), null);
});

test('parsePushData refuses missing fields', () => {
  assert.equal(parsePushData({ type: 'comment', targetType: 'post', targetId: TID }), null);
  assert.equal(parsePushData({ nid: NID, targetType: 'post', targetId: TID }), null);
  assert.equal(parsePushData(valid({ targetId: undefined })), null, 'a target type needs a target id');
});

test('parsePushData accepts a null target and refuses non-objects', () => {
  assert.deepEqual(parsePushData(valid({ targetType: null, targetId: null })), { nid: NID, type: 'comment', targetType: null, targetId: null });
  for (const raw of [null, undefined, 'x', 42, [valid()]]) assert.equal(parsePushData(raw), null);
});

test('pushGroupKey matches get_notifications grouping', () => {
  assert.equal(pushGroupKey(parsePushData(valid())), `comment:${TID}`);
  assert.equal(pushGroupKey(parsePushData(valid({ type: 'reply', targetType: 'comment' }))), `reply:${TID}`);
  assert.equal(pushGroupKey(parsePushData(valid({ type: 'sale_request', targetType: 'listing' }))), NID);
  assert.equal(pushGroupKey(parsePushData(valid({ type: 'content_removed' }))), NID);
});

// ---------------------------------------------------------------- destinations

const expected = {
  comment: { kind: 'post', id: TID, needsPublished: true },
  reaction: { kind: 'post', id: TID, needsPublished: true },
  return_request: { kind: 'listing', id: TID, needsPublished: true },
  return_confirmed: { kind: 'listing', id: TID, needsPublished: true },
  sale_request: { kind: 'listing', id: TID, needsPublished: true },
  sale_confirmed: { kind: 'listing', id: TID, needsPublished: true },
  reply: { kind: 'notifications' },
  comment_reaction: { kind: 'notifications' },
  content_approved: { kind: 'post', id: TID, needsPublished: true },
  content_rejected: { kind: 'post-status', source: 'post', id: TID },
  content_removed: { kind: 'post-status', source: 'post', id: TID },
};
const targetFor = { return_request: 'listing', return_confirmed: 'listing', sale_request: 'listing', sale_confirmed: 'listing', reply: 'comment', comment_reaction: 'comment' };

test('pushDestination covers every push type', () => {
  assert.deepEqual(Object.keys(expected).sort(), [...PUSH_TYPES].sort());
  for (const type of PUSH_TYPES) {
    const data = parsePushData(valid({ type, targetType: targetFor[type] ?? 'post' }));
    assert.deepEqual(pushDestination(data), expected[type], type);
  }
});

test('pushDestination: comments targets and missing targets open the Notifications list', () => {
  assert.deepEqual(pushDestination(parsePushData(valid({ type: 'content_approved', targetType: 'comment' }))), { kind: 'notifications' });
  assert.deepEqual(pushDestination(parsePushData(valid({ type: 'content_removed', targetType: 'comment' }))), { kind: 'notifications' });
  assert.deepEqual(pushDestination(parsePushData(valid({ targetType: null, targetId: null }))), { kind: 'notifications' });
  assert.deepEqual(pushDestination(parsePushData(valid({ type: 'comment', targetType: 'listing' }))), { kind: 'listing', id: TID, needsPublished: true });
});

test('notificationDestination with a known thread (the Notifications list) opens it', () => {
  const base = { targetType: 'comment', targetId: TID, parentListingId: null };
  assert.deepEqual(notificationDestination({ ...base, type: 'reply', parentPostId: PARENT }), { kind: 'post', id: PARENT, needsPublished: false });
  assert.deepEqual(notificationDestination({ ...base, type: 'comment_reaction', parentPostId: null, parentListingId: PARENT }), {
    kind: 'listing',
    id: PARENT,
    needsPublished: false,
  });
  assert.deepEqual(notificationDestination({ ...base, type: 'reply', parentPostId: null }), { kind: 'unavailable' });
  assert.deepEqual(notificationDestination({ ...base, type: 'content_rejected', parentPostId: null }), { kind: 'none' });
});

// ---------------------------------------------------------------- permission policy

const perm = {
  undetermined: { granted: false, status: 'undetermined', canAskAgain: true },
  granted: { granted: true, status: 'granted', canAskAgain: true },
  deniedCanAsk: { granted: false, status: 'denied', canAskAgain: true },
  deniedForGood: { granted: false, status: 'denied', canAskAgain: false },
};
const ask = (over) =>
  decidePushAsk({ runtimePrompt: true, permission: perm.undetermined, memory: EMPTY_ASK_MEMORY, trigger: 'onboarded', ...over });

test('hasRuntimePrompt: iOS and Android 13+ only', () => {
  assert.equal(hasRuntimePrompt('ios', null), true);
  assert.equal(hasRuntimePrompt('android', 33), true);
  assert.equal(hasRuntimePrompt('android', 34), true);
  assert.equal(hasRuntimePrompt('android', 32), false);
  assert.equal(hasRuntimePrompt('android', null), false);
  assert.equal(hasRuntimePrompt('web', null), false);
});

test('granted: register, whatever the trigger or memory', () => {
  for (const trigger of ['onboarded', 'published', 'settings']) {
    assert.equal(ask({ permission: perm.granted, trigger, memory: { explainerAsks: 2, declined: true } }), 'register');
  }
});

test('undetermined after onboarding: explain once', () => {
  assert.equal(ask({}), 'explain');
  assert.equal(ask({ memory: { explainerAsks: 1, declined: false } }), 'nothing');
});

test('denied but can ask again: still explain on onboarding', () => {
  assert.equal(ask({ permission: perm.deniedCanAsk }), 'explain');
});

test('denied for good: never the system dialog; Settings points to the phone settings', () => {
  assert.equal(ask({ permission: perm.deniedForGood }), 'nothing');
  assert.equal(ask({ permission: perm.deniedForGood, trigger: 'published', memory: { explainerAsks: 1, declined: true } }), 'nothing');
  assert.equal(ask({ permission: perm.deniedForGood, trigger: 'settings' }), 'blocked');
});

test('Android 12 and older: no prompt, just register when allowed', () => {
  assert.equal(ask({ runtimePrompt: false, permission: perm.granted }), 'register');
  assert.equal(ask({ runtimePrompt: false, permission: perm.deniedForGood }), 'nothing');
  assert.equal(ask({ runtimePrompt: false, permission: perm.undetermined, trigger: 'settings' }), 'blocked');
});

test('"Not now" once: one gentle reminder after the first post or comment', () => {
  const declinedOnce = { explainerAsks: 1, declined: true };
  assert.equal(ask({ trigger: 'published', memory: declinedOnce }), 'explain');
  assert.equal(ask({ trigger: 'onboarded', memory: declinedOnce }), 'nothing');
  // Without "Not now" (closed by Allow, then denied in the system dialog), no reminder.
  assert.equal(ask({ trigger: 'published', memory: { explainerAsks: 1, declined: false } }), 'nothing');
  assert.equal(ask({ trigger: 'published', memory: EMPTY_ASK_MEMORY }), 'nothing');
});

test('"Not now" twice: never asked again (at most two explainers in total)', () => {
  assert.equal(MAX_EXPLAINER_ASKS, 2);
  const declinedTwice = { explainerAsks: 2, declined: true };
  for (const trigger of ['onboarded', 'published']) assert.equal(ask({ trigger, memory: declinedTwice }), 'nothing');
  assert.equal(ask({ trigger: 'published', memory: { explainerAsks: 5, declined: true } }), 'nothing');
});

test('Settings "Enable": the system dialog when it can still be asked', () => {
  assert.equal(ask({ trigger: 'settings' }), 'request');
  assert.equal(ask({ trigger: 'settings', permission: perm.deniedCanAsk, memory: { explainerAsks: 2, declined: true } }), 'request');
});

test('permissionBanner states', () => {
  assert.equal(permissionBanner(true, perm.granted), 'none');
  assert.equal(permissionBanner(true, perm.undetermined), 'not-asked');
  assert.equal(permissionBanner(true, perm.deniedCanAsk), 'not-asked');
  assert.equal(permissionBanner(true, perm.deniedForGood), 'blocked');
  assert.equal(permissionBanner(false, perm.deniedForGood), 'blocked');
});

test('parseAskMemory reads stored memory and falls back safely', () => {
  assert.deepEqual(parseAskMemory(JSON.stringify({ explainerAsks: 1, declined: true })), { explainerAsks: 1, declined: true });
  assert.deepEqual(parseAskMemory(null), EMPTY_ASK_MEMORY);
  assert.deepEqual(parseAskMemory('not json'), EMPTY_ASK_MEMORY);
  assert.deepEqual(parseAskMemory(JSON.stringify({ explainerAsks: -3, declined: 'yes' })), { explainerAsks: 0, declined: false });
});
