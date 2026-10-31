// Run with: npm run test:tally  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyMyReaction, estimateTally, parseTally, reactAndRank, TOP_REACTIONS_LIMIT, topOf } from '../lib/reactionTally.ts';

// The reaction_type enum order (lib/reactions.ts REACTION_TYPES): the server breaks ties with it.
const ORDER = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
const exact = (tally, top, total, mine) => ({ tally, top, total, mine });

test('first reaction on a post with none', () => {
  const r = reactAndRank(exact({}, [], 0, null), 'love', ORDER);
  assert.deepEqual(r, { tally: { love: 1 }, top: ['love'], total: 1, mine: 'love' });
});

test('adding my reaction to a type others used re-sorts by count', () => {
  const r = reactAndRank(exact({ like: 2, love: 2 }, ['like', 'love'], 4, null), 'love', ORDER);
  assert.deepEqual(r.top, ['love', 'like']);
  assert.equal(r.total, 5);
});

test('changing my type swaps the counts and keeps the total', () => {
  const r = reactAndRank(exact({ like: 3, love: 1 }, ['like', 'love'], 4, 'love'), 'wow', ORDER);
  assert.deepEqual(r.tally, { like: 3, wow: 1 });
  assert.deepEqual(r.top, ['like', 'wow']);
  assert.equal(r.total, 4);
  assert.equal(r.mine, 'wow');
});

test('removing my reaction drops a type that reaches 0', () => {
  const r = reactAndRank(exact({ like: 1, love: 1 }, ['like', 'love'], 2, 'love'), null, ORDER);
  assert.deepEqual(r.tally, { like: 1 });
  assert.deepEqual(r.top, ['like']);
  assert.equal(r.total, 1);
  assert.equal(r.mine, null);
  assert.deepEqual(reactAndRank(exact({ love: 1 }, ['love'], 1, 'love'), null, ORDER), { tally: {}, top: [], total: 0, mine: null });
});

test('tapping the same type again changes nothing (the button sends null for a removal)', () => {
  const s = exact({ like: 1 }, ['like'], 1, 'like');
  assert.deepEqual(reactAndRank(s, 'like', ORDER), { tally: { like: 1 }, top: ['like'], total: 1, mine: 'like' });
});

test('ties follow the reaction order, like the server', () => {
  assert.deepEqual(topOf({ wow: 2, like: 2, sad: 2 }, ORDER), ['like', 'wow', 'sad']);
  assert.deepEqual(topOf({ angry: 1, haha: 1 }, ORDER), ['haha', 'angry']);
});

test('the cluster is capped at 3 types', () => {
  assert.equal(TOP_REACTIONS_LIMIT, 3);
  assert.deepEqual(topOf({ like: 5, love: 4, haha: 3, wow: 2, sad: 1 }, ORDER), ['like', 'love', 'haha']);
  const r = reactAndRank(exact({ like: 1, love: 1, haha: 1 }, ['like', 'love', 'haha'], 3, null), 'angry', ORDER);
  assert.deepEqual(r.top, ['like', 'love', 'haha']);
  assert.equal(r.total, 4);
});

test('counts never go below 0', () => {
  assert.deepEqual(applyMyReaction({}, 'love', null), {});
  assert.deepEqual(applyMyReaction({ like: 0 }, 'like', 'love'), { love: 1 });
  assert.equal(reactAndRank(exact({}, [], 0, 'love'), null, ORDER).total, 0);
});

test('without exact counts: estimate, and my lone reaction disappears at once', () => {
  // Feed row: cluster [like, love], 3 reactions, mine is love. Removing it drops the heart.
  const r = reactAndRank({ tally: null, top: ['like', 'love'], total: 3, mine: 'love' }, null, ORDER);
  assert.deepEqual(r.top, ['like']);
  assert.equal(r.total, 2);
  assert.equal(r.tally, null, 'an estimate is not kept as exact');
  // Adding a new type to a cluster with room shows it immediately.
  assert.deepEqual(reactAndRank({ tally: null, top: ['like'], total: 4, mine: null }, 'wow', ORDER).top, ['like', 'wow']);
});

test('estimateTally gives each shown type one and the rest to the most used', () => {
  assert.deepEqual(estimateTally(['like', 'love'], 5, null), { like: 4, love: 1 });
  assert.deepEqual(estimateTally(['like', 'love', 'haha'], 4, 'wow'), { like: 1, love: 1, haha: 1, wow: 1 });
  assert.deepEqual(estimateTally([], 0, null), {});
});

test('parseTally keeps known types with positive counts', () => {
  assert.deepEqual(parseTally({ like: 5, love: 0, bogus: 3, wow: 2 }, ORDER), { like: 5, wow: 2 });
  assert.equal(parseTally(null, ORDER), null);
  assert.equal(parseTally([1], ORDER), null);
});
