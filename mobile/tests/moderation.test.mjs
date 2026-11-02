// Run with: npm run test:moderation  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// lib/moderation.ts imports '@/lib/manilaDate' and '@/lib/time' (tsconfig paths).
register('./aliasHook.mjs', import.meta.url);
const { formatCount, formatOpenReportsLabel, formatSignupTime, parseBadgeCounts, toModerationStats, toRecentSignups } = await import(
  '../lib/moderation.ts'
);

const M = await import('../lib/moderation.ts');
const { getModerationActionError } = await import('../lib/errors.ts');

const badge = (over = {}) => ({ code: 'campus_hero', name: 'Campus Hero', count: 3, ...over });

// ---------------------------------------------------------------- badge_counts

test('parseBadgeCounts keeps valid rows in the server order, zero included', () => {
  const rows = [badge(), badge({ code: 'nocturnal', name: 'Night Owl', count: 0 })];
  assert.deepEqual(parseBadgeCounts(rows), rows);
  assert.deepEqual(parseBadgeCounts([badge({ extra: 'x' })]), [badge()]);
});

test('parseBadgeCounts: anything that is not an array is empty', () => {
  for (const raw of [null, undefined, 'x', 42, {}, { 0: badge() }]) assert.deepEqual(parseBadgeCounts(raw), []);
});

test('parseBadgeCounts drops bad items', () => {
  const bad = [
    null,
    'campus_hero',
    [badge()],
    badge({ code: '' }),
    badge({ code: 7 }),
    badge({ name: '  ' }),
    badge({ name: null }),
    badge({ count: -1 }),
    badge({ count: 1.5 }),
    badge({ count: '3' }),
    badge({ count: Number.NaN }),
    badge({ count: undefined }),
  ];
  assert.deepEqual(parseBadgeCounts([...bad, badge()]), [badge()]);
});

// ---------------------------------------------------------------- stats and sign-ups

const statsRow = (over = {}) => ({
  total_members: 120,
  signups_24h: 4,
  signups_7d: 19,
  engaged_members: 80,
  active_7d: 33,
  badge_counts: [badge()],
  ...over,
});

test('toModerationStats maps the one row', () => {
  assert.deepEqual(toModerationStats([statsRow()]), {
    totalMembers: 120,
    signups24h: 4,
    signups7d: 19,
    engagedMembers: 80,
    active7d: 33,
    badgeCounts: [badge()],
  });
  assert.deepEqual(toModerationStats([statsRow({ badge_counts: 'oops' })]).badgeCounts, []);
});

test('toModerationStats refuses a missing row or a bad total', () => {
  assert.equal(toModerationStats([]), null);
  assert.equal(toModerationStats(null), null);
  assert.equal(toModerationStats([statsRow({ total_members: -1 })]), null);
  assert.equal(toModerationStats([statsRow({ active_7d: null })]), null);
});

test('toRecentSignups drops rows without an id, nickname or date', () => {
  const ok = { user_id: 'u1', nickname: 'kopi', created_at: '2026-11-01T01:00:00Z' };
  assert.deepEqual(
    toRecentSignups([ok, { ...ok, user_id: null }, { ...ok, nickname: null }, { ...ok, nickname: ' ' }, { ...ok, created_at: null }]),
    [{ userId: 'u1', nickname: 'kopi', createdAt: '2026-11-01T01:00:00Z' }],
  );
  assert.deepEqual(toRecentSignups(null), []);
});

// ---------------------------------------------------------------- labels and formatting

test('formatOpenReportsLabel', () => {
  assert.equal(formatOpenReportsLabel(0), 'Moderation');
  assert.equal(formatOpenReportsLabel(1), 'Moderation, 1 open report');
  assert.equal(formatOpenReportsLabel(4), 'Moderation, 4 open reports');
  assert.equal(formatOpenReportsLabel(150), 'Moderation, 150 open reports');
  assert.equal(formatOpenReportsLabel(-2), 'Moderation');
  assert.equal(formatOpenReportsLabel(Number.NaN), 'Moderation');
});

test('formatCount groups thousands and reads bad values as 0', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1234), '1,234');
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount(-5), '0');
  assert.equal(formatCount(Number.NaN), '0');
});

test('formatSignupTime shows Manila day and time', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  // 13:05 UTC is 9:05 PM in Manila, the same day.
  assert.equal(formatSignupTime('2026-11-01T13:05:00Z', now), 'Nov 1, 9:05 PM');
  // 16:30 UTC on Oct 31 is 12:30 AM on Nov 1 in Manila.
  assert.equal(formatSignupTime('2026-10-31T16:30:00Z', now), 'Nov 1, 12:30 AM');
  // Noon in Manila.
  assert.equal(formatSignupTime('2026-10-30T04:00:00Z', now), 'Oct 30, 12:00 PM');
  // Postgres text without an offset is UTC.
  assert.equal(formatSignupTime('2026-11-01 13:05:00.123456', now), 'Nov 1, 9:05 PM');
  // Another year shows the year.
  assert.equal(formatSignupTime('2025-12-31T02:00:00Z', now), 'Dec 31, 2025, 10:00 AM');
  assert.equal(formatSignupTime('not a date', now), '');
});

// ---------------------------------------------------------------- reports queue and detail (step 2b)

const ID = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const ID2 = '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b';

test('parseModTarget accepts the four types and a uuid only', () => {
  for (const type of ['post', 'comment', 'listing', 'profile']) assert.deepEqual(M.parseModTarget(type, ID), { type, id: ID });
  assert.deepEqual(M.parseModTarget('post', ID.toUpperCase()), { type: 'post', id: ID });
  const bad = [
    ['user', ID],
    ['Post', ID],
    ['', ID],
    [undefined, ID],
    [['post'], ID],
    ['post', 'not-a-uuid'],
    ['post', `${ID}x`],
    ['post', ''],
    ['post', undefined],
    ['post', [ID]],
  ];
  for (const [type, id] of bad) assert.equal(M.parseModTarget(type, id), null, `${String(type)} ${String(id)}`);
});

test('the removal reasons equal the web panel list (codes, and the label sent as p_reason)', async () => {
  const web = await import('../../admin/lib/review/reasons.ts');
  assert.deepEqual(
    M.REMOVAL_REASONS.map((r) => ({ ...r })),
    web.REJECT_REASONS.map((r) => ({ ...r })),
  );
  for (const r of web.REJECT_REASONS) assert.equal(M.removalReasonText(r.value), web.reasonLabel(r.value));
  assert.equal(M.removalReasonText('rude'), null);
  assert.equal(M.removalReasonText(null), null);
});

test('allowedActions: never Remove for a profile; Remove only while published; Dismiss while reports are open', () => {
  assert.deepEqual(M.allowedActions('profile', 'published', 2), ['dismiss']);
  assert.deepEqual(M.allowedActions('profile', 'published', 0), []);
  for (const type of ['post', 'comment', 'listing']) {
    assert.deepEqual(M.allowedActions(type, 'published', 1), ['remove', 'dismiss'], type);
    assert.deepEqual(M.allowedActions(type, 'published', 0), ['remove'], type);
    assert.deepEqual(M.allowedActions(type, 'removed', 3), ['dismiss'], type);
    assert.deepEqual(M.allowedActions(type, 'pending', 1), ['dismiss'], type);
    assert.deepEqual(M.allowedActions(type, null, 1), ['dismiss'], type);
  }
});

const IMAGES = [
  { path: 'u/a.jpg', width: 10, height: 10 },
  { path: 'u/b.jpg', width: 10, height: 10 },
];
const queueRow = (over = {}) => ({
  target_type: 'post',
  target_id: ID,
  report_count: 3,
  reasons: ['spam', 'bullying'],
  first_reported_at: '2026-11-01T01:00:00Z',
  content_status: 'published',
  title: 'confession',
  body: '  Hello campus  ',
  images: IMAGES,
  author_id: ID2,
  nickname: 'kopi',
  avatar_key: 'avatar_01',
  ...over,
});

test('toReportQueueItem maps a row; posts never show their kind as a title', () => {
  assert.deepEqual(M.toReportQueueItem(queueRow()), {
    key: `post:${ID}`,
    type: 'post',
    id: ID,
    reportCount: 3,
    reasons: ['Spam', 'Bullying or harassment'],
    firstReportedAt: '2026-11-01T01:00:00Z',
    title: null,
    body: 'Hello campus',
    images: IMAGES,
    imageCount: 2,
    authorId: ID2,
    nickname: 'kopi',
    avatarKey: 'avatar_01',
    status: 'published',
  });
  assert.equal(M.toReportQueueItem(queueRow({ target_type: 'listing', title: ' Calculator ' })).title, 'Calculator');
});

test('toReportQueueItem handles nulls, unknown reasons and bad rows', () => {
  const item = M.toReportQueueItem(
    queueRow({ report_count: null, reasons: ['spam', 'weird', 'spam', 7, '', 'other_thing'], body: '   ', images: null, nickname: null }),
  );
  assert.equal(item.reportCount, 0);
  assert.deepEqual(item.reasons, ['Spam', 'Other reason']);
  assert.equal(item.body, null);
  assert.equal(item.imageCount, 0);
  assert.equal(item.nickname, null);
  assert.deepEqual(M.toReportQueueItem(queueRow({ reasons: null })).reasons, []);
  assert.equal(M.toReportQueueItem(queueRow({ target_type: 'user' })), null);
  assert.equal(M.toReportQueueItem(queueRow({ target_id: 'x' })), null);
  assert.equal(M.toReportQueueItem(queueRow({ first_reported_at: null })), null);
});

test('imageCount counts entries with a path only', () => {
  assert.equal(M.imageCount([{ path: 'a' }, { path: '' }, null, 'x', { width: 1 }]), 1);
  assert.equal(M.imageCount('[]'), 0);
});

test('nextReportsCursor: the last raw row of a full page (first report time, target id), else none', () => {
  const rows = [queueRow({ target_id: ID2, first_reported_at: '2026-10-30T00:00:00Z' }), queueRow({ target_type: 'user' })];
  assert.deepEqual(M.nextReportsCursor(rows, 2), { ts: '2026-11-01T01:00:00Z', id: ID });
  assert.equal(M.nextReportsCursor(rows, 20), null);
  assert.equal(M.nextReportsCursor([], 20), null);
});

test('queueItemLabel reads naturally', () => {
  assert.equal(
    M.queueItemLabel({ type: 'post', reportCount: 3, reasons: ['Spam', 'Bullying or harassment'] }),
    'Post, 3 reports, spam and bullying or harassment',
  );
  assert.equal(M.queueItemLabel({ type: 'profile', reportCount: 1, reasons: ['Other'] }), 'Profile, 1 report, other');
  assert.equal(M.queueItemLabel({ type: 'comment', reportCount: 2, reasons: [] }), 'Comment, 2 reports');
  assert.equal(
    M.queueItemLabel({ type: 'listing', reportCount: 4, reasons: ['Spam', 'Other', 'Prohibited item'] }),
    'Listing, 4 reports, spam, other and prohibited item',
  );
});

test('toReportEntries and firstOpenAt', () => {
  const rows = [
    { report_id: 'r1', reason: 'spam', note: ' too many links ', status: 'dismissed', created_at: '2026-10-01T00:00:00Z', reporter_nickname: 'a' },
    { report_id: 'r2', reason: 'mystery', note: null, status: 'open', created_at: '2026-10-05T00:00:00Z', reporter_nickname: null },
    { report_id: 'r3', reason: null, note: '  ', status: null, created_at: '2026-10-03T00:00:00Z', reporter_nickname: 'b' },
    { report_id: null, reason: 'spam', note: null, status: 'open', created_at: '2026-10-02T00:00:00Z', reporter_nickname: 'c' },
  ];
  const entries = M.toReportEntries(rows);
  assert.deepEqual(
    entries.map((e) => [e.id, e.reason, e.note, e.status, e.reporter]),
    [
      ['r1', 'Spam', 'too many links', 'dismissed', 'a'],
      ['r2', 'Other reason', null, 'open', null],
      ['r3', 'Other reason', null, 'open', 'b'],
    ],
  );
  assert.equal(M.firstOpenAt(entries), '2026-10-03T00:00:00Z');
  assert.equal(M.firstOpenAt(entries.slice(0, 1)), null);
  assert.deepEqual(M.toReportEntries(null), []);
});

test('toModContent and profileContent', () => {
  const target = { type: 'listing', id: ID };
  const row = { status: 'published', title: 'Bike', body: 'Good bike', images: [], author_id: ID2, nickname: null, created_at: '2026-10-01T00:00:00Z' };
  assert.deepEqual(M.toModContent(target, [row]), {
    type: 'listing',
    id: ID,
    status: 'published',
    title: 'Bike',
    body: 'Good bike',
    images: [],
    authorId: ID2,
    nickname: null,
    avatarKey: null,
    createdAt: '2026-10-01T00:00:00Z',
  });
  assert.equal(M.toModContent({ type: 'post', id: ID }, [row]).title, null);
  assert.equal(M.toModContent(target, []), null);
  const profile = M.profileContent({ type: 'profile', id: ID }, M.toReportQueueItem(queueRow({ target_type: 'profile', body: 'About me: hi' })));
  assert.equal(profile.authorId, ID);
  assert.equal(profile.body, 'About me: hi');
  assert.deepEqual(profile.images, []);
  assert.equal(M.profileContent({ type: 'profile', id: ID }, null).nickname, null);
});

// ---------------------------------------------------------------- action errors

const rpcError = (message) => ({ message, code: 'P0001', details: null, hint: null });

test('getModerationActionError maps each code', () => {
  for (const code of ['not_found', 'invalid_transition']) {
    assert.deepEqual(getModerationActionError(rpcError(code)), { kind: 'already_handled', message: 'Already handled by another moderator.' });
  }
  const pick = { kind: 'reason_required', message: 'Pick a reason for removing this.' };
  assert.deepEqual(getModerationActionError(rpcError('reason_required')), pick);
  assert.deepEqual(getModerationActionError(new Error('reason_required')), pick);
  assert.deepEqual(getModerationActionError(rpcError('forbidden')), { kind: 'forbidden', message: 'This area is for moderators only.' });
});

test('getModerationActionError never shows raw database text', () => {
  const raw = { message: 'syntax error at or near "select" in function mod_review line 3', code: '42601', details: null, hint: null };
  assert.deepEqual(getModerationActionError(raw), { kind: 'other', message: 'Something went wrong. Please try again.' });
  assert.equal(getModerationActionError(new TypeError('Network request failed')).message, 'No connection. Check your internet and try again.');
  assert.equal(getModerationActionError(null).kind, 'other');
});

// ---------------------------------------------------------------- "⋯" menu staff actions (step 3)

test('getStaffMenuActions: both for staff on others\' posts, comments and listings; nothing otherwise', () => {
  for (const type of ['post', 'comment', 'listing']) {
    assert.deepEqual(M.getStaffMenuActions(type, true, false), ['remove', 'open'], type);
    assert.deepEqual(M.getStaffMenuActions(type, false, false), [], `${type} non-staff`);
    assert.deepEqual(M.getStaffMenuActions(type, true, true), [], `${type} own`);
    assert.deepEqual(M.getStaffMenuActions(type, false, true), [], `${type} own non-staff`);
  }
  assert.deepEqual(M.getStaffMenuActions('profile', true, false), []);
  assert.deepEqual(M.getStaffMenuActions('user', true, false), []);
});

const MOD_KEYS = [['mod-reports'], ['mod-report'], ['mod-open-reports'], ['mod-stats']];

test('removalInvalidations: the item\'s views, then the moderation caches', () => {
  assert.deepEqual(M.MODERATION_CACHE_KEYS, MOD_KEYS);
  assert.deepEqual(M.removalInvalidations('post', ID), [['post', ID], ['user-posts'], ['trending'], ['polls'], ...MOD_KEYS]);
  assert.deepEqual(M.removalInvalidations('listing', ID), [['listing', ID], ['listings'], ...MOD_KEYS]);
  assert.deepEqual(M.removalInvalidations('comment', ID), [['comments'], ['replies'], ['post'], ['listing'], ...MOD_KEYS]);
});

test('every invalidated key is one the app clears on sign-out or already uses', async () => {
  const fs = await import('node:fs/promises');
  const auth = await fs.readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
  for (const [key] of MOD_KEYS) assert.ok(auth.includes(`'${key}'`), `${key} is cleared on sign-out`);
  const authored = await fs.readFile(new URL('../lib/authoredLists.ts', import.meta.url), 'utf8');
  for (const key of ['post', 'listing', 'listings', 'comments', 'replies', 'trending', 'polls', 'user-posts']) {
    assert.ok(authored.includes(`['${key}']`), `${key} is an existing list key`);
  }
});

test('the menu flow reuses the queue error mapping', () => {
  assert.equal(getModerationActionError(rpcError('invalid_transition')).message, 'Already handled by another moderator.');
  assert.equal(getModerationActionError(rpcError('reason_required')).kind, 'reason_required');
  assert.equal(getModerationActionError(rpcError('forbidden')).message, 'This area is for moderators only.');
  assert.equal(getModerationActionError(rpcError('relation "public.posts" does not exist')).message, 'Something went wrong. Please try again.');
});

// ---------------------------------------------------------------- held for review (step 2c)

const heldRow = (over = {}) => ({
  target_type: 'listing',
  target_id: ID,
  created_at: '2026-11-01T02:00:00Z',
  title: ' Beer for sale ',
  body: 'Cold ones',
  images: IMAGES,
  author_id: ID2,
  nickname: 'kopi',
  hold_reason: 'keyword',
  matched_term: 'beer',
  ...over,
});

test('parseHeldTarget: posts, comments and listings with a uuid; never a profile', () => {
  for (const type of ['post', 'comment', 'listing']) assert.deepEqual(M.parseHeldTarget(type, ID), { type, id: ID });
  for (const [type, id] of [['profile', ID], ['user', ID], ['post', 'nope'], [undefined, ID], ['post', undefined]]) {
    assert.equal(M.parseHeldTarget(type, id), null, `${String(type)} ${String(id)}`);
  }
});

test('toHeldItem maps a row, keeps the hold record and never invents one', () => {
  assert.deepEqual(M.toHeldItem(heldRow()), {
    key: `listing:${ID}`,
    type: 'listing',
    id: ID,
    createdAt: '2026-11-01T02:00:00Z',
    title: 'Beer for sale',
    body: 'Cold ones',
    images: IMAGES,
    imageCount: 2,
    authorId: ID2,
    nickname: 'kopi',
    hold: { reason: 'keyword', term: 'beer' },
  });
  const post = M.toHeldItem(heldRow({ target_type: 'post', title: 'confession', hold_reason: null, matched_term: null, images: null, body: ' ' }));
  assert.equal(post.title, null, 'a post kind is not a title');
  assert.equal(post.body, null);
  assert.equal(post.imageCount, 0);
  assert.deepEqual(post.hold, { reason: null, term: null });
  assert.deepEqual(M.toHeldItem(heldRow({ hold_reason: 'pre_moderation', matched_term: 'x' })).hold, { reason: 'pre_moderation', term: null });
  assert.deepEqual(M.toHeldItem(heldRow({ hold_reason: 'mystery' })).hold, { reason: null, term: null });
  assert.equal(M.toHeldItem(heldRow({ target_type: 'profile' })), null);
  assert.equal(M.toHeldItem(heldRow({ target_id: 'x' })), null);
  assert.equal(M.toHeldItem(heldRow({ created_at: null })), null);
});

test('holdLabel and heldItemLabel', () => {
  assert.equal(M.holdLabel({ reason: 'keyword', term: 'beer' }), 'Keyword: beer');
  assert.equal(M.holdLabel({ reason: 'keyword', term: null }), 'Keyword match');
  assert.equal(M.holdLabel({ reason: 'pre_moderation', term: null }), 'Pre-moderation');
  assert.equal(M.holdLabel({ reason: null, term: null }), null);
  assert.equal(M.heldItemLabel({ type: 'comment', hold: { reason: 'keyword', term: 'fb.com/' } }), 'Comment, held for review, keyword: fb.com/');
  assert.equal(M.heldItemLabel({ type: 'post', hold: { reason: null, term: null } }), 'Post, held for review');
});

test('nextHeldCursor: the last raw row\'s created_at on a full page, as the web panel', () => {
  const rows = [heldRow({ created_at: '2026-10-31T00:00:00Z' }), heldRow({ target_type: 'profile', created_at: '2026-11-01T05:00:00Z' })];
  assert.equal(M.nextHeldCursor(rows, 2), '2026-11-01T05:00:00Z');
  assert.equal(M.nextHeldCursor(rows, 20), null);
  assert.equal(M.nextHeldCursor([], 20), null);
});

test('toHeldCounts adds the pending counts; heldBreakdown leaves zeros out', () => {
  const counts = M.toHeldCounts([{ pending_posts: 2, pending_comments: 1, pending_listings: 0, open_reports: 9 }]);
  assert.deepEqual(counts, { posts: 2, comments: 1, listings: 0, total: 3 });
  assert.equal(M.heldBreakdown(counts), '2 posts · 1 comment');
  assert.equal(M.heldBreakdown({ posts: 0, comments: 0, listings: 1, total: 1 }), '1 listing');
  assert.equal(M.heldBreakdown({ posts: 1200, comments: 2, listings: 3, total: 1205 }), '1,200 posts · 2 comments · 3 listings');
  assert.equal(M.heldBreakdown({ posts: 0, comments: 0, listings: 0, total: 0 }), 'Nothing waiting');
  assert.equal(M.toHeldCounts([]), null);
  assert.equal(M.toHeldCounts(null), null);
  assert.equal(M.toHeldCounts([{ pending_posts: -1, pending_comments: 0, pending_listings: 0 }]), null);
  assert.equal(M.toHeldCounts([{ pending_posts: null, pending_comments: 0, pending_listings: 0 }]), null);
});

test('allowedReviewActions: Approve and Reject only while pending', () => {
  assert.deepEqual(M.allowedReviewActions('pending'), ['approve', 'reject']);
  for (const status of ['published', 'rejected', 'removed', null, '']) assert.deepEqual(M.allowedReviewActions(status), [], String(status));
});

test('the reject reasons are the web panel\'s REJECT_REASONS (codes and labels)', async () => {
  const web = await import('../../admin/lib/review/reasons.ts');
  assert.deepEqual(
    M.REJECT_REASONS.map((r) => ({ ...r })),
    web.REJECT_REASONS.map((r) => ({ ...r })),
  );
});

const HELD_KEYS = [['mod-held'], ['mod-held-item'], ['mod-dashboard'], ['mod-stats']];

test('reviewInvalidations: Approve refreshes where the item now shows; Reject only the queue and the item', () => {
  assert.deepEqual(M.HELD_CACHE_KEYS, HELD_KEYS);
  assert.deepEqual(M.reviewInvalidations('post', ID, 'approve'), [['feed'], ['post', ID], ['user-posts'], ['trending'], ['polls'], ...HELD_KEYS]);
  assert.deepEqual(M.reviewInvalidations('listing', ID, 'approve'), [['listings'], ['listing', ID], ...HELD_KEYS]);
  assert.deepEqual(M.reviewInvalidations('comment', ID, 'approve'), [['comments'], ['replies'], ['post'], ['listing'], ...HELD_KEYS]);
  assert.deepEqual(M.reviewInvalidations('post', ID, 'reject'), [['post', ID], ...HELD_KEYS]);
  assert.deepEqual(M.reviewInvalidations('listing', ID, 'reject'), [['listing', ID], ...HELD_KEYS]);
  assert.deepEqual(M.reviewInvalidations('comment', ID, 'reject'), [['comments'], ...HELD_KEYS]);
});

test('held cache keys are cleared on sign-out', async () => {
  const fs = await import('node:fs/promises');
  const auth = await fs.readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
  for (const [key] of HELD_KEYS) assert.ok(auth.includes(`'${key}'`), key);
});

test('toHeldContent keeps the hold record of mod_get_content', () => {
  const row = { status: 'pending', title: null, body: 'hi', images: [], author_id: ID2, nickname: 'kopi', created_at: '2026-11-01T00:00:00Z', hold_reason: 'pre_moderation', matched_term: null };
  const detail = M.toHeldContent({ type: 'post', id: ID }, [row]);
  assert.equal(detail.content.status, 'pending');
  assert.deepEqual(detail.hold, { reason: 'pre_moderation', term: null });
  assert.equal(M.toHeldContent({ type: 'post', id: ID }, []), null);
});

test('review errors reuse the moderation mapping', () => {
  assert.equal(getModerationActionError(rpcError('invalid_transition')).kind, 'already_handled');
  assert.equal(getModerationActionError(rpcError('not_found')).kind, 'already_handled');
  assert.equal(getModerationActionError(new Error('reason_required')).kind, 'reason_required');
  assert.equal(getModerationActionError(rpcError('forbidden')).kind, 'forbidden');
  assert.equal(getModerationActionError(rpcError('deleted_by_author')).message, 'Something went wrong. Please try again.');
});

// ---------------------------------------------------------------- staff check (step 4b: push taps)

const staff = (over = {}) => M.staffState({ restored: true, membership: 'member', hasUser: true, isPending: false, isError: false, data: true, ...over });

test('staffState: confirmed staff only', () => {
  assert.deepEqual(staff(), { isStaff: true, isLoading: false });
  assert.deepEqual(staff({ data: false }), { isStaff: false, isLoading: false }, 'a member, or demoted');
  assert.deepEqual(staff({ isError: true }), { isStaff: false, isLoading: false }, 'fails closed');
  assert.deepEqual(staff({ isError: true, data: true }), { isStaff: false, isLoading: false }, 'a failed refresh drops the cached yes');
});

test('staffState waits on a cold start: session, profile, then the check', () => {
  assert.deepEqual(staff({ restored: false, membership: 'guest', hasUser: false, isPending: true, data: undefined }), { isStaff: false, isLoading: true });
  assert.deepEqual(staff({ membership: 'loading', isPending: true, data: undefined }), { isStaff: false, isLoading: true });
  assert.deepEqual(staff({ isPending: true, data: undefined }), { isStaff: false, isLoading: true });
});

test('staffState: guests and members without a nickname are not staff, and not loading', () => {
  assert.deepEqual(staff({ membership: 'guest', hasUser: false, isPending: true, data: undefined }), { isStaff: false, isLoading: false });
  assert.deepEqual(staff({ membership: 'needs-nickname', isPending: true, data: undefined }), { isStaff: false, isLoading: false });
  assert.deepEqual(staff({ membership: 'error', isPending: true, data: undefined }), { isStaff: false, isLoading: false });
});

// ---------------------------------------------------------------- versions in use (mod_app_versions)

const ver = (over = {}) => ({ app_version: '1.0.2', platform: 'android', members: 5, seen_7d: 3, ...over });
const notReporting = (over = {}) => ({ app_version: null, platform: null, members: 9, seen_7d: 0, ...over });

test('toAppVersionRows maps valid rows in the server order', () => {
  assert.deepEqual(M.toAppVersionRows([ver(), ver({ platform: 'ios', members: 2, seen_7d: 2 }), ver({ app_version: '1.0.1', members: 4, seen_7d: 0 })]), [
    { version: '1.0.2', platform: 'android', members: 5, seen7d: 3 },
    { version: '1.0.2', platform: 'ios', members: 2, seen7d: 2 },
    { version: '1.0.1', platform: 'android', members: 4, seen7d: 0 },
  ]);
});

test('toAppVersionRows keeps the not-reporting row (version null) and always puts it last', () => {
  const rows = M.toAppVersionRows([notReporting(), ver({ app_version: '1.0.10' }), ver()]);
  assert.deepEqual(
    rows.map((r) => r.version),
    ['1.0.10', '1.0.2', null],
  );
  assert.deepEqual(rows[2], { version: null, platform: null, members: 9, seen7d: 0 });
});

test('toAppVersionRows: an unknown platform becomes null', () => {
  assert.equal(M.toAppVersionRows([ver({ platform: 'web' })])[0].platform, null);
  assert.equal(M.toAppVersionRows([ver({ platform: null })])[0].platform, null);
  assert.equal(M.toAppVersionRows([ver({ platform: 'Android' })])[0].platform, null);
});

test('toAppVersionRows coerces numeric strings and drops malformed rows', () => {
  assert.deepEqual(M.toAppVersionRows([ver({ members: '7', seen_7d: '4' })])[0], { version: '1.0.2', platform: 'android', members: 7, seen7d: 4 });
  const bad = [
    null,
    'row',
    42,
    ver({ app_version: '1.0' }),
    ver({ app_version: 'abc' }),
    ver({ app_version: 102 }),
    ver({ members: 'many' }),
    ver({ members: 1.5 }),
    ver({ members: undefined }),
    ver({ seen_7d: -1 }),
    ver({ seen_7d: 'x' }),
  ];
  assert.deepEqual(M.toAppVersionRows(bad), []);
});

test('toAppVersionRows drops groups with 0 or negative members; a missing seen_7d counts as 0', () => {
  assert.deepEqual(M.toAppVersionRows([ver({ members: 0 }), ver({ members: -3 }), notReporting({ members: 0 })]), []);
  assert.equal(M.toAppVersionRows([ver({ seen_7d: undefined })])[0].seen7d, 0);
});

test('toAppVersionRows: empty and non-array input give no rows', () => {
  assert.deepEqual(M.toAppVersionRows([]), []);
  assert.deepEqual(M.toAppVersionRows(null), []);
  assert.deepEqual(M.toAppVersionRows(undefined), []);
  assert.deepEqual(M.toAppVersionRows({ app_version: '1.0.2' }), []);
});

test('appVersionLabel and appVersionDetail', () => {
  const android = { version: '1.0.2', platform: 'android', members: 12, seen7d: 9 };
  assert.equal(M.appVersionLabel(android), '1.0.2 · Android');
  assert.equal(M.appVersionLabel({ ...android, platform: 'ios' }), '1.0.2 · iOS');
  assert.equal(M.appVersionLabel({ ...android, platform: null }), '1.0.2');
  assert.equal(M.appVersionDetail(android), '12 members · 9 seen in 7 days');
  assert.equal(M.appVersionDetail({ ...android, members: 1, seen7d: 1 }), '1 member · 1 seen in 7 days');
  assert.equal(M.appVersionDetail({ ...android, members: 1234, seen7d: 0 }), '1,234 members · 0 seen in 7 days');

  const none = { version: null, platform: null, members: 5, seen7d: 0 };
  assert.equal(M.appVersionLabel(none), 'Not reporting yet (older builds)');
  assert.equal(M.appVersionDetail(none), '5 members');
  assert.equal(M.appVersionDetail({ ...none, members: 1 }), '1 member');
});
