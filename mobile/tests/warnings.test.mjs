// Run with: npm run test:warnings  (Node 22.6+ strips the TypeScript types of the import)
// Notices from the moderators (warnings and mutes): never the staff member, only reason and note.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

// Resolves the "@/" imports of the app modules loaded below.
register('./aliasHook.mjs', import.meta.url);

const W = await import('../lib/warnings.ts');
const { parsePushData, pushDestination, pushGroupKey } = await import('../lib/pushNotifications.ts');
const { getErrorMessage, getChatError } = await import('../lib/errors.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const NID = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const NOW = Date.parse('2026-11-06T10:00:00Z');
const fmt = (iso) => `<${iso}>`;

// ---------------------------------------------------------------- labels and text

test('reason labels; an unknown code never shows raw', () => {
  assert.deepEqual(
    ['harassment', 'spam_scam', 'sexual_content', 'threats', 'filter_evasion', 'other'].map(W.warningReasonLabel),
    ['Harassment', 'Spam or scam', 'Sexual content', 'Threats', 'Filter evasion', 'Other'],
  );
  assert.equal(W.warningReasonLabel('something_new'), 'Breaking the community rules');
  assert.equal(W.warningReasonLabel(null), 'Breaking the community rules');
  assert.equal(W.WARNING_ROW_TITLE, 'Notice from the moderators');
});

test('titles: Warning / You were muted', () => {
  assert.equal(W.warningTitle('warning'), 'Warning');
  assert.equal(W.warningTitle('mute'), 'You were muted');
  assert.equal(W.isWarningKind('mute'), true);
  assert.equal(W.isWarningKind('ban'), false);
});

test('mute line: until a future time, or ended', () => {
  assert.equal(W.muteLine('2026-11-07T10:00:00Z', NOW, fmt), "You're muted until <2026-11-07T10:00:00Z>. You can still read, but you can't post, comment or react.");
  assert.equal(W.muteLine('2026-11-06T09:59:59Z', NOW, fmt), 'This restriction has ended.');
  assert.equal(W.muteLine('2026-11-06T10:00:00Z', NOW, fmt), 'This restriction has ended.', 'exactly now counts as ended');
  assert.equal(W.muteLine(null, NOW, fmt), 'This restriction has ended.');
  assert.equal(W.muteLine('not a date', NOW, fmt), 'This restriction has ended.');
  assert.equal(W.muteInForce('2026-11-06T10:00:01Z', NOW), true);
  assert.match(W.formatLocalDateTime('2026-11-07T10:00:00Z'), /\d/);
});

test('a timed restriction reads "muted": with the end time only for a known future end', () => {
  const base = W.MUTED_FOR_NOW;
  assert.equal(base, "You're muted for now. You can still read, but you can't post, comment or react.");
  assert.equal(W.suspendedMessage(base, null, NOW, fmt), base);
  assert.equal(W.suspendedMessage(base, '2026-11-05T00:00:00Z', NOW, fmt), base);
  assert.equal(W.suspendedMessage(base, '2026-11-08T00:00:00Z', NOW, fmt), "You're muted until <2026-11-08T00:00:00Z>. You can still read, but you can't post, comment or react.");
});

test('errors.ts reuses it for suspended errors and asks for the end time', () => {
  let seen = 0;
  const off = W.onSuspendedSeen(() => (seen += 1));
  const err = { message: 'suspended' };
  W.noteSuspendedUntil(null);
  assert.equal(getErrorMessage(err), "You're muted for now. You can still read, but you can't post, comment or react.");
  assert.equal(seen, 1);
  const future = new Date(Date.now() + 3_600_000).toISOString();
  W.noteSuspendedUntil(future);
  assert.match(getErrorMessage(err), /^You're muted until .+\. You can still read, but you can't post, comment or react\.$/);
  assert.match(getChatError(err, 'message').message, /muted until/);
  // A ban keeps its own wording.
  assert.equal(getErrorMessage({ message: 'banned' }), 'This account has been banned.');
  // Other errors never ask.
  getErrorMessage({ message: 'banned' });
  assert.equal(seen, 3);
  off();
  W.noteSuspendedUntil(null);
});

// ---------------------------------------------------------------- push

test('a warning push parses without a target and opens its sheet', () => {
  const data = parsePushData({ nid: NID, type: 'warning', targetType: null, targetId: null });
  assert.deepEqual(data, { nid: NID, type: 'warning', targetType: null, targetId: null });
  assert.deepEqual(pushDestination(data), { kind: 'warning', notificationId: NID });
  assert.equal(pushGroupKey(data), NID, 'marked read by its notification id (its group key)');
  assert.equal(parsePushData({ nid: NID, type: 'warning', targetType: 'post', targetId: NID }), null);
  assert.equal(parsePushData({ nid: 'x', type: 'warning' }), null);
});

test('push and list taps open the same sheet', () => {
  assert.match(read('../hooks/usePushNotifications.ts'), /else if \(dest\.kind === 'warning'\) openWarningSheet\(dest\.notificationId\);/);
  assert.match(read('../app/notifications.tsx'), /if \(g\.type === 'warning'\) return openWarningSheet\(g\.group_key\);/);
  const screen = read('../app/notifications.tsx');
  const open = screen.slice(screen.indexOf('const open = useCallback'));
  assert.ok(open.indexOf('markRead([g]);') < open.indexOf("g.type === 'warning'"), 'marked read first');
  assert.match(read('../app/_layout.tsx'), /<WarningSheet \/>/);
});

// ---------------------------------------------------------------- the list never breaks

test("the row schema accepts 'warning', drops anything else that does not fit, row by row", () => {
  const src = read('../lib/notifications.ts');
  const list = src.slice(src.indexOf('const NOTIFICATION_TYPES'), src.indexOf('] as const', src.indexOf('const NOTIFICATION_TYPES')));
  assert.ok(list.includes("'warning'"));
  assert.match(src, /\.refine\(\(r\) => r\.type === 'warning' \|\| \(r\.target_type !== null && r\.target_id !== null\)\);/);
  assert.match(src, /const parsed = rowSchema\.safeParse\(row\);\s*if \(parsed\.success\) items\.push\(parsed\.data\);/);
});

// ---------------------------------------------------------------- privacy

function sources() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) out.set(rel, readFileSync(join(root, rel), 'utf8'));
    }
  };
  for (const d of ['app', 'components', 'hooks', 'lib', 'stores']) walk(d);
  return out;
}

test('never a staff name or avatar on a notice; no note or reason in logs', () => {
  const sheet = read('../components/notifications/WarningSheet.tsx');
  assert.doesNotMatch(sheet, /actor|nickname|Avatar|ProfileLink/);
  const row = read('../components/notifications/NotificationRow.tsx');
  const warningLeading = row.slice(row.indexOf("if (group.type === 'warning') {"), row.indexOf('// Moderation notices'));
  assert.match(warningLeading, /shield-outline/);
  assert.doesNotMatch(warningLeading, /actor|Avatar|ProfileLink/);
  const api = read('../lib/notifications.ts');
  const fetch = api.slice(api.indexOf('export async function fetchMyWarning'));
  assert.match(fetch, /logError\('rpc\.get_my_warning', \{ code: error\.code \?\? 'unknown' \}\);/);
  const callers = [...sources()].filter(([, t]) => /rpc\('get_my_warning'/.test(t)).map(([p]) => p);
  assert.deepEqual(callers, ['lib/notifications.ts']);
  // The own-row read logs a code only and reads only status and end time.
  const restriction = read('../hooks/useMyRestriction.ts');
  assert.match(restriction, /select\('status, suspended_until'\)\.eq\('user_id', userId\)/);
  assert.match(restriction, /logError\('restriction\.read', \{ code: error\.code \}\);/);
});

test('sign-out forgets the notice sheet, its cache and the known end time', () => {
  const auth = read('../lib/auth.ts');
  const clear = auth.slice(auth.indexOf('export function clearMemberCaches'), auth.indexOf('const REVOKE_TIMEOUT_MS'));
  assert.match(clear, /'warning-notice', 'my-restriction'/);
  assert.match(clear, /closeWarningSheet\(\);\s*noteSuspendedUntil\(null\);/);
});
