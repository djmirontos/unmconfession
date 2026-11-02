// Run with: npm run test:getstarted  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const G = await import('../lib/getStarted.ts');
const { createLatestOnlyQueue } = await import('../lib/latestOnlyQueue.ts');

const ready = (count) => ({ state: 'ready', count });
const base = { membership: 'member', stored: 'none', count: ready(0) };
const show = (over) => G.shouldShowGetStarted({ ...base, ...over });

// ---------------------------------------------------------------- visibility

test('a full member with fewer than 3 reactions sees the card', () => {
  assert.equal(show({ count: ready(0) }), true);
  assert.equal(show({ count: ready(2) }), true);
});

test('3 or more reactions hide it', () => {
  assert.equal(show({ count: ready(3) }), false);
  assert.equal(show({ count: ready(10) }), false);
});

test('never for guests, nickname-less accounts or an unknown account', () => {
  for (const membership of ['guest', 'needs-nickname', 'loading', 'error']) {
    for (const count of [ready(0), ready(2), { state: 'loading' }]) {
      assert.equal(show({ membership, count }), false, `${membership}`);
    }
  }
});

test('nothing while the count is loading or failed (no flash, fails closed)', () => {
  assert.equal(show({ count: { state: 'loading' } }), false);
  assert.equal(show({ count: { state: 'error' } }), false);
});

test('nothing while the stored state is read, or once dismissed or completed', () => {
  for (const stored of [null, 'dismissed', 'completed']) {
    for (const count of [ready(0), ready(2), ready(3)]) assert.equal(show({ stored, count }), false, `${stored}`);
  }
});

test('every combination: shown only for member + none + ready below 3', () => {
  const memberships = ['guest', 'loading', 'error', 'needs-nickname', 'member'];
  const storeds = [null, 'none', 'dismissed', 'completed'];
  const counts = [{ state: 'loading' }, { state: 'error' }, ready(0), ready(2), ready(3), ready(10)];
  for (const membership of memberships) {
    for (const stored of storeds) {
      for (const count of counts) {
        const expected = membership === 'member' && stored === 'none' && count.state === 'ready' && count.count < 3;
        assert.equal(G.shouldShowGetStarted({ membership, stored, count }), expected, JSON.stringify({ membership, stored, count }));
      }
    }
  }
});

// ---------------------------------------------------------------- progress

test('progress label and spoken text clamp to 0–3', () => {
  assert.equal(G.getStartedProgressLabel(0), '0/3');
  assert.equal(G.getStartedProgressLabel(2), '2/3');
  assert.equal(G.getStartedProgressLabel(3), '3/3');
  assert.equal(G.getStartedProgressLabel(10), '3/3');
  assert.equal(G.getStartedProgressLabel(-1), '0/3');
  assert.equal(G.getStartedProgressA11y(2), '2 of 3 reactions');
  assert.equal(G.getStartedProgressA11y(7), '3 of 3 reactions');
});

test('only a brand-new reaction counts: not a removal, not a change of type', () => {
  assert.equal(G.isNewReaction(null, 'like'), true);
  assert.equal(G.isNewReaction('like', null), false);
  assert.equal(G.isNewReaction('like', 'love'), false);
  assert.equal(G.isNewReaction(null, null), false);
});

test('the reaction queue tells the sender the previously confirmed value', async () => {
  const sends = [];
  const queue = createLatestOnlyQueue(
    async (key, value, previous) => {
      sends.push([value, previous]);
    },
    () => assert.fail('no error expected'),
  );
  await queue('p1', null, 'like'); // new
  await queue('p1', 'like', 'love'); // type change
  await queue('p1', 'love', null); // removal
  assert.deepEqual(sends, [['like', null], ['love', 'like'], [null, 'love']]);
  assert.deepEqual(sends.filter(([value, previous]) => G.isNewReaction(previous, value)).length, 1);
});

// ---------------------------------------------------------------- storage

test('the storage key is per user and contains the user id', () => {
  const a = G.getStartedStorageKey('11111111-1111-4111-8111-111111111111');
  const b = G.getStartedStorageKey('22222222-2222-4222-8222-222222222222');
  assert.equal(a, 'unm-get-started:11111111-1111-4111-8111-111111111111');
  assert.notEqual(a, b);
});

test('stored values parse; anything else counts as not dismissed', () => {
  assert.equal(G.parseGetStartedStored('dismissed'), 'dismissed');
  assert.equal(G.parseGetStartedStored('completed'), 'completed');
  assert.equal(G.parseGetStartedStored(null), 'none');
  assert.equal(G.parseGetStartedStored('garbage'), 'none');
});

test('account deletion removes the key, and logout clears the count cache', () => {
  const auth = readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8');
  // forgetDeletedAccount removes every AsyncStorage key containing the user id.
  const cleanup = auth.match(/keys\.filter\(\(k\) => k\.includes\(userId\)\)/);
  assert.ok(cleanup, 'forgetDeletedAccount still removes keys that contain the user id');
  const userId = '33333333-3333-4333-8333-333333333333';
  assert.ok([G.getStartedStorageKey(userId)].filter((k) => k.includes(userId)).length === 1);
  const members = auth.match(/function clearMemberCaches\(\) \{\s*for \(const key of \[([^\]]*)\]/);
  assert.ok(members?.[1].includes(`'${G.GET_STARTED_COUNT_KEY}'`), 'clearMemberCaches lists the count key');
});

// ---------------------------------------------------------------- copy

test('the card copy', () => {
  assert.equal(G.GET_STARTED_COPY.title, 'Get started');
  assert.equal(G.GET_STARTED_COPY.body, "Tap a reaction on 3 posts. It's the quickest way to join in.");
  assert.equal(G.GET_STARTED_COPY.done, "Nice, you're in!");
  assert.equal(G.GET_STARTED_COPY.dismiss, 'Dismiss get started');
});
