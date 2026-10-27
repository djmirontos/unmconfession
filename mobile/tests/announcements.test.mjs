// Run with: npm run test:announcements  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addClosedId, CLOSED_MAX, parseClosedIds, pickAnnouncement } from '../lib/announcementPick.ts';

const NOW = Date.parse('2026-10-27T02:00:00Z');
const a = (id, starts_at, { ends_at = null, created_at = starts_at } = {}) => ({ id, starts_at, ends_at, created_at });

const older = a('older', '2026-10-20T00:00:00Z');
const newer = a('newer', '2026-10-26T00:00:00Z');
const scheduled = a('scheduled', '2026-10-28T00:00:00Z');
const ended = a('ended', '2026-10-25T00:00:00Z', { ends_at: '2026-10-27T01:00:00Z' });

test('picks the newest live announcement by starts_at', () => {
  assert.equal(pickAnnouncement([older, newer], [], NOW)?.id, 'newer');
  assert.equal(pickAnnouncement([newer, older], [], NOW)?.id, 'newer');
});

test('same start: the newest created_at wins', () => {
  const first = a('first', '2026-10-26T00:00:00Z', { created_at: '2026-10-25T00:00:00Z' });
  const second = a('second', '2026-10-26T00:00:00Z', { created_at: '2026-10-25T05:00:00Z' });
  assert.equal(pickAnnouncement([first, second], [], NOW)?.id, 'second');
});

test('closed ones are skipped; the next newest shows', () => {
  assert.equal(pickAnnouncement([older, newer], ['newer'], NOW)?.id, 'older');
  assert.equal(pickAnnouncement([older, newer], ['newer', 'older'], NOW), null);
});

test('scheduled and ended ones are skipped, including at the boundaries', () => {
  assert.equal(pickAnnouncement([scheduled, ended, older], [], NOW)?.id, 'older');
  assert.equal(pickAnnouncement([a('starts-now', '2026-10-27T02:00:00Z')], [], NOW)?.id, 'starts-now');
  assert.equal(pickAnnouncement([a('ends-now', '2026-10-20T00:00:00Z', { ends_at: '2026-10-27T02:00:00Z' })], [], NOW), null);
  assert.equal(pickAnnouncement([scheduled, ended], [], NOW), null);
});

test('an empty list gives nothing', () => {
  assert.equal(pickAnnouncement([], [], NOW), null);
  assert.equal(pickAnnouncement([], ['x'], NOW), null);
});

test('the timestamp parser can be supplied', () => {
  const calls = [];
  const parse = (s) => {
    calls.push(s);
    return Date.parse(s);
  };
  assert.equal(pickAnnouncement([older], [], NOW, parse)?.id, 'older');
  assert.ok(calls.length > 0);
});

test('addClosedId: no duplicates, newest last', () => {
  assert.deepEqual(addClosedId([], 'a'), ['a']);
  assert.deepEqual(addClosedId(['a', 'b'], 'a'), ['b', 'a']);
  assert.deepEqual(addClosedId(['a', 'b'], 'c'), ['a', 'b', 'c']);
});

test('addClosedId keeps the 200 most recent', () => {
  const full = Array.from({ length: CLOSED_MAX }, (_, i) => `id${i}`);
  const next = addClosedId(full, 'new');
  assert.equal(CLOSED_MAX, 200);
  assert.equal(next.length, CLOSED_MAX);
  assert.equal(next[0], 'id1');
  assert.equal(next.at(-1), 'new');
  // Re-closing one already in a full list keeps the size.
  assert.equal(addClosedId(full, 'id0').length, CLOSED_MAX);
});

test('parseClosedIds treats missing or malformed data as empty', () => {
  assert.deepEqual(parseClosedIds(null), []);
  assert.deepEqual(parseClosedIds(''), []);
  assert.deepEqual(parseClosedIds('{bad json'), []);
  assert.deepEqual(parseClosedIds('{"a":1}'), []);
  assert.deepEqual(parseClosedIds('"a"'), []);
  assert.deepEqual(parseClosedIds('["a",1,null,"b",{"c":2}]'), ['a', 'b']);
  assert.deepEqual(parseClosedIds(JSON.stringify(Array.from({ length: 250 }, (_, i) => `id${i}`))).length, CLOSED_MAX);
});
