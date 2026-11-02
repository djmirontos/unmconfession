// Run with: npm run test:upvotes  (Node 22.6+ strips the TypeScript types of the import)
// v1.0.3 Q&A answer upvotes: who may upvote, the optimistic toggle, labels, errors, row defaults, order.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// lib/errors.ts and lib/commentOrder.ts import '@/lib/...' (tsconfig paths).
register('./aliasHook.mjs', import.meta.url);
const U = await import('../lib/upvotes.ts');
const { getUpvoteErrorMessage, getErrorMessage, OWN_ANSWER_MESSAGE } = await import('../lib/errors.ts');
const { byTime } = await import('../lib/commentOrder.ts');

const rpcError = (message) => ({ message, code: 'P0001', details: null, hint: null });

// ---------------------------------------------------------------- who may upvote

test('only top-level comments on a Q&A post show the upvote', () => {
  assert.equal(U.showsUpvote(true, null), true);
  assert.equal(U.showsUpvote(true, 'parent'), false); // a reply
  assert.equal(U.showsUpvote(false, null), false); // a normal post or a listing
  assert.equal(U.showsUpvote(false, 'parent'), false);
});

test('checkUpvote: answers by others are ok, my own is refused, anything else is not an answer', () => {
  const base = { qaThread: true, parentId: null, authorId: 'a', myId: 'me' };
  assert.equal(U.checkUpvote(base), 'ok');
  assert.equal(U.checkUpvote({ ...base, authorId: 'me' }), 'own');
  assert.equal(U.checkUpvote({ ...base, parentId: 'p' }), 'not_answer');
  assert.equal(U.checkUpvote({ ...base, qaThread: false }), 'not_answer');
  // Guests (no id) are sent to sign in by the caller, never treated as the author.
  assert.equal(U.checkUpvote({ ...base, myId: null }), 'ok');
});

// ---------------------------------------------------------------- optimistic toggle

const s = (upvoteCount, myUpvote) => ({ id: 'c1', upvoteCount, myUpvote });

test('toggling on and off moves the count by one', () => {
  assert.deepEqual(U.toggleUpvote(s(2, false), true), s(3, true));
  assert.deepEqual(U.toggleUpvote(s(3, true), false), s(2, false));
});

test('the same vote again changes nothing (same object)', () => {
  const on = s(3, true);
  assert.equal(U.toggleUpvote(on, true), on);
  const off = s(0, false);
  assert.equal(U.toggleUpvote(off, false), off);
});

test('the count never goes below 0', () => {
  assert.deepEqual(U.toggleUpvote(s(0, true), false), s(0, false));
});

test('rollback: toggling back to the last confirmed vote restores the count', () => {
  const before = s(5, false);
  const optimistic = U.toggleUpvote(before, true);
  assert.deepEqual(U.toggleUpvote(optimistic, false), before);
});

test('the server count overrides the optimistic one; my vote stays', () => {
  assert.deepEqual(U.withServerCount(s(3, true), 7), s(7, true));
  const same = s(4, true);
  assert.equal(U.withServerCount(same, 4), same);
  // A bad server value counts as 0 rather than breaking the row.
  assert.deepEqual(U.withServerCount(s(4, true), null), s(0, true));
});

// ---------------------------------------------------------------- labels

test('upvotesLabel: 0, 1, 2', () => {
  assert.equal(U.upvotesLabel(0), '0 upvotes');
  assert.equal(U.upvotesLabel(1), '1 upvote');
  assert.equal(U.upvotesLabel(2), '2 upvotes');
});

test('button labels say what a tap does, then the count', () => {
  assert.equal(U.upvoteA11yLabel(s(0, false)), 'Upvote, 0 upvotes');
  assert.equal(U.upvoteA11yLabel(s(1, false)), 'Upvote, 1 upvote');
  assert.equal(U.upvoteA11yLabel(s(1, true)), 'Remove upvote, 1 upvote');
  assert.equal(U.upvoteA11yLabel(s(2, true)), 'Remove upvote, 2 upvotes');
});

// ---------------------------------------------------------------- errors

test('upvote errors: own answer and gone answers have their own text', () => {
  assert.equal(OWN_ANSWER_MESSAGE, "You can't upvote your own answer.");
  assert.equal(getUpvoteErrorMessage(rpcError('own_answer')), "You can't upvote your own answer.");
  assert.equal(getUpvoteErrorMessage(rpcError('not_found')), 'This answer is no longer available.');
});

test('upvote errors: account states, network and anything else use the usual texts', () => {
  for (const code of ['banned', 'suspended', 'nickname_required', 'not_authenticated', 'something_new']) {
    assert.equal(getUpvoteErrorMessage(rpcError(code)), getErrorMessage(rpcError(code)), code);
  }
  const offline = new TypeError('Network request failed');
  assert.equal(getUpvoteErrorMessage(offline), getErrorMessage(offline));
});

// ---------------------------------------------------------------- thread row defaults

test('rows from before upvotes existed read as 0 and not upvoted', () => {
  for (const v of [undefined, null, -1, 1.5, '3']) assert.equal(U.toUpvoteCount(v), 0, String(v));
  assert.equal(U.toUpvoteCount(4), 4);
  for (const v of [undefined, null, false, 'true', 1]) assert.equal(U.toMyUpvote(v), false, String(v));
  assert.equal(U.toMyUpvote(true), true);
});

// ---------------------------------------------------------------- order

test('answers stay in time order: upvotes never change it', () => {
  const rows = [
    { id: 'b', time: '2026-11-03T10:00:00Z', upvoteCount: 9 },
    { id: 'c', time: '2026-11-03T09:00:00Z', upvoteCount: 0 },
    { id: 'a', time: '2026-11-03T10:00:00Z', upvoteCount: 1 },
  ];
  assert.deepEqual(
    [...rows].sort(byTime).map((r) => r.id),
    ['c', 'a', 'b'],
  );
});
