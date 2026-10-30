// Run with: npm run test:badges  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { badgeStyle, chunkIds, idsToFetch, isStaffBadge, resultsById, TOP_BADGES_CHUNK, toBadges, toTopBadges } from '../lib/badges.ts';

const row = (code, earned_at = '2026-10-29T16:30:00Z') => ({ code, name: code, description: `${code} description`, earned_at });

test('known earned codes have their own icon and tone, and are not staff', () => {
  for (const code of ['first_circle', 'campus_voice', 'campus_regular', 'nocturnal']) {
    const style = badgeStyle(code);
    assert.equal(style.staff, false, code);
    assert.notEqual(style.icon, 'ribbon-outline', code);
    assert.notEqual(style.tone, 'textDim', code);
  }
});

test('moderator and admin are staff labels', () => {
  assert.equal(badgeStyle('moderator').staff, true);
  assert.equal(badgeStyle('admin').staff, true);
});

test('staff icons are distinct: admin filled shield-checkmark, moderator outlined shield, both accent', () => {
  assert.deepEqual(badgeStyle('admin'), { icon: 'shield-checkmark', tone: 'accent', staff: true });
  assert.deepEqual(badgeStyle('moderator'), { icon: 'shield-outline', tone: 'accent', staff: true });
});

test('earned badges keep their own icons', () => {
  assert.equal(badgeStyle('first_circle').icon, 'star');
  assert.equal(badgeStyle('campus_voice').icon, 'megaphone');
  assert.equal(badgeStyle('campus_regular').icon, 'calendar');
  assert.equal(badgeStyle('nocturnal').icon, 'moon');
});

test('an unknown code falls back to a neutral style instead of failing', () => {
  assert.deepEqual(badgeStyle('campus_hero'), { icon: 'ribbon-outline', tone: 'textDim', staff: false });
  assert.deepEqual(badgeStyle(''), { icon: 'ribbon-outline', tone: 'textDim', staff: false });
  // Inherited object keys are not badge codes.
  assert.equal(badgeStyle('toString').icon, 'ribbon-outline');
  assert.equal(badgeStyle('__proto__').icon, 'ribbon-outline');
});

test('toBadges maps rows, keeps the server order and a null earnedAt for staff', () => {
  const badges = toBadges([row('first_circle'), row('nocturnal'), { ...row('moderator'), name: 'Moderator', earned_at: null }]);
  assert.deepEqual(
    badges.map((b) => b.code),
    ['first_circle', 'nocturnal', 'moderator'],
  );
  assert.equal(badges[0].earnedAt, '2026-10-29T16:30:00Z');
  assert.equal(badges[2].earnedAt, null);
  assert.equal(badges[2].name, 'Moderator');
  assert.equal(isStaffBadge(badges[2]), true);
  assert.equal(isStaffBadge(badges[0]), false);
});

test('toBadges drops rows without a code or name and handles an empty result', () => {
  assert.deepEqual(toBadges([{ code: null, name: 'x', description: null, earned_at: null }, { code: 'x', name: '', description: null, earned_at: null }]), []);
  assert.deepEqual(toBadges([]), []);
  assert.deepEqual(toBadges(null), []);
  assert.equal(toBadges([{ code: 'nocturnal', name: 'Nocturnal', description: null, earned_at: null }])[0].description, '');
});

// ---------------------------------------------------------------- get_top_badges batching


const uid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const never = () => false;

test('idsToFetch: 0 ids asks nothing; null and empty ids are ignored', () => {
  assert.deepEqual(idsToFetch([], never), []);
  assert.deepEqual(chunkIds(idsToFetch([], never)), []);
  assert.deepEqual(idsToFetch([null, undefined, ''], never), []);
});

test('idsToFetch: 1 id gives one chunk of one', () => {
  const ids = idsToFetch([uid(1)], never);
  assert.deepEqual(chunkIds(ids), [[uid(1)]]);
});

test('101 ids are split into two chunks (100 + 1)', () => {
  const ids = idsToFetch(Array.from({ length: 101 }, (_, i) => uid(i)), never);
  const chunks = chunkIds(ids);
  assert.equal(TOP_BADGES_CHUNK, 100);
  assert.deepEqual(chunks.map((c) => c.length), [100, 1]);
  assert.equal(chunks[1][0], uid(100));
});

test('a feed page of 20 posts by 20 authors is one chunk (one call)', () => {
  assert.equal(chunkIds(idsToFetch(Array.from({ length: 20 }, (_, i) => uid(i)), never)).length, 1);
});

test('duplicate authors are asked once, in first-seen order', () => {
  assert.deepEqual(idsToFetch([uid(2), uid(1), uid(2), uid(1)], never), [uid(2), uid(1)]);
});

test('cached ids are skipped, including cached "no badge"', () => {
  const cache = new Map([
    [uid(1), { userId: uid(1), code: 'admin', name: 'Admin' }],
    [uid(2), null], // "no badge" is a cached answer too
  ]);
  assert.deepEqual(idsToFetch([uid(1), uid(2), uid(3)], (id) => cache.has(id)), [uid(3)]);
  assert.deepEqual(idsToFetch([uid(1), uid(2)], (id) => cache.has(id)), []);
});

test('resultsById answers every asked id: its badge, or null for no badge', () => {
  const results = resultsById([uid(1), uid(2)], toTopBadges([{ user_id: uid(1), code: 'first_circle', name: 'First Circle' }]));
  assert.deepEqual(results.get(uid(1)), { userId: uid(1), code: 'first_circle', name: 'First Circle' });
  assert.equal(results.get(uid(2)), null);
  assert.equal(results.has(uid(2)), true);
  // A row for an id that was not asked is ignored.
  assert.equal(resultsById([uid(1)], toTopBadges([{ user_id: uid(9), code: 'admin', name: 'Admin' }])).has(uid(9)), false);
});

test('toTopBadges drops incomplete rows and keeps unknown codes', () => {
  assert.deepEqual(toTopBadges([{ user_id: uid(1), code: 'campus_hero', name: 'Campus Hero' }, { user_id: null, code: 'admin', name: 'Admin' }]), [
    { userId: uid(1), code: 'campus_hero', name: 'Campus Hero' },
  ]);
  assert.deepEqual(toTopBadges(null), []);
});
