// Run with: npm run test:holdreason  (Node 22.6+ strips the TypeScript types of the import)
// Held content: the author is told THAT the word filter held it, never WHICH word.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const H = await import('../lib/holdReason.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

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
const SRC = sources();
const OLD = "Sent for review. You'll be notified when it's approved.";

// ---------------------------------------------------------------- the text

test('keyword gets the filter line; everything else keeps the old text exactly', () => {
  assert.equal(H.holdNoticeText('keyword', OLD), "This was held for review because it contains words that aren't allowed. A moderator will check it.");
  for (const other of ['pre_moderation', null, undefined, '', 'KEYWORD', 'something_new', 42]) {
    assert.equal(H.holdNoticeText(other, OLD), OLD, String(other));
  }
  assert.equal(H.isHoldReason('keyword'), true);
  assert.equal(H.isHoldReason('pre_moderation'), true);
  assert.equal(H.isHoldReason('Keyword'), false);
  assert.equal(H.isHoldReason(null), false);
});

test('the line never names a word or explains the filter', () => {
  assert.doesNotMatch(H.KEYWORD_HOLD_TEXT, /"|'[a-z]+'|matched|term|list|regex/i);
});

test('the 2-second upgrade rule', () => {
  const up = (reason, elapsedMs, stillShowing = true) => H.shouldUpgradeToast({ reason, elapsedMs, stillShowing });
  assert.equal(H.HOLD_REASON_WAIT_MS, 2000);
  assert.equal(up('keyword', 0), true);
  assert.equal(up('keyword', 1999), true);
  assert.equal(up('keyword', 2000), true);
  assert.equal(up('keyword', 2001), false, 'too late: the old text stays');
  assert.equal(up('keyword', -1), false);
  assert.equal(up('keyword', 500, false), false, 'another toast took its place');
  assert.equal(up('pre_moderation', 100), false);
  assert.equal(up(null, 100), false);
});

test('the query key holds the user id, type and id', () => {
  assert.deepEqual(H.holdReasonKey('U', 'post', 'P'), ['hold-reason', 'U', 'post', 'P']);
  assert.equal(H.HOLD_REASON_STALE_MS, 5 * 60 * 1000);
  // Never persisted; cleared on sign-out (and by user id on account deletion).
  assert.doesNotMatch(read('../lib/queryClient.ts'), /'hold-reason'/);
  assert.match(read('../lib/auth.ts'), /'get-started-count', 'hold-reason'[,\]]/);
});

// ---------------------------------------------------------------- source scans

test('the RPC is called in one place, and logs only the error code', () => {
  const callers = [...SRC].filter(([, t]) => /rpc\('get_my_hold_reason'/.test(t)).map(([p]) => p);
  assert.deepEqual(callers, ['lib/holdNotice.ts']);
  const api = read('../lib/holdNotice.ts');
  assert.match(api, /logError\('holdReason', \{ code: getErrorCode\(error\) \?\? 'unknown' \}\);/);
  assert.equal([...api.matchAll(/logError\(/g)].length, 1);
  assert.doesNotMatch(api, /console\./);
});

test("asked only for the member's own items: just created or edited, or their own pending rows", () => {
  const calls = [];
  for (const [path, text] of SRC) {
    for (const m of text.matchAll(/announceHold\(([^)]*)\)/g)) if (path !== 'lib/holdNotice.ts') calls.push(`${path}: ${m[1]}`);
  }
  assert.deepEqual(calls.sort(), [
    "hooks/useCommentThread.ts: 'comment', item.id, 'Sent for review'",
    "hooks/useCommentThread.ts: 'comment', item.id, 'Sent for review'",
    "hooks/useCommentThread.ts: 'comment', item.id, 'Sent for review'",
    'hooks/useCreateSubmit.ts: created.kind, created.id, pendingToast(created',
    "hooks/useEditSave.ts: held.type, held.id, 'Sent for review'",
  ]);
  // The edit forms pass the item being edited (always the member's own, from My Posts).
  assert.match(read('../components/edit/EditPostForm.tsx'), /\{ type: 'post', id: item\.id \}/);
  assert.match(read('../components/edit/EditListingForm.tsx'), /\{ type: 'listing', id: item\.id \}/);
  // The hook runs only for the viewer's own pending row.
  const hooks = [];
  for (const [path, text] of SRC) for (const m of text.matchAll(/= useHoldReason\(([^;]*)\);/g)) hooks.push(`${path}: ${m[1]}`);
  assert.deepEqual(hooks.sort(), [
    "app/post-status.tsx: item.source, item.id, item.status === 'pending'",
    "components/comments/CommentItem.tsx: 'comment', comment.id, mine && comment.state === 'pending'",
  ]);
  assert.match(read('../hooks/useHoldReason.ts'), /queryFn: ownPending && userId \? \(\) => fetchHoldReason\(type, id\) : skipToken/);
});

test('the submit is never held up: the old text shows first, the answer only upgrades it', () => {
  const api = read('../lib/holdNotice.ts');
  const fn = api.slice(api.indexOf('export function announceHold'));
  assert.ok(fn.indexOf('show(fallback);') < fn.indexOf('fetchHoldReason('));
  assert.match(fn, /\.catch\(\(\) => undefined\);/);
  assert.doesNotMatch(fn, /await /);
  // Today's texts are unchanged.
  assert.match(read('../hooks/useCreateSubmit.ts'), /const PENDING_TOAST = "Sent for review\. You'll be notified when it's approved\.";/);
  assert.match(read('../hooks/useEditSave.ts'), /else showToast\('Sent for review'\);/);
});

test('the old "never say why" rule is replaced by "told THAT, never WHICH word"', () => {
  for (const [path, text] of SRC) assert.doesNotMatch(text, /never say why/i, path);
  assert.match(read('../app/post-status.tsx'), /told THAT the word filter held it, never WHICH word/);
  assert.match(read('../app/post-status.tsx'), /holdNoticeText\(holdReason, 'A moderator will check it before it is published\.'\)/);
  assert.match(read('../components/comments/CommentItem.tsx'), /holdNoticeText\(holdReason, 'Only you can see this until a moderator approves it\.'\)/);
});

test('native config and dependencies unchanged from HEAD', () => {
  const repo = join(root, '..');
  for (const f of ['mobile/app.json', 'mobile/app.config.ts', 'mobile/eas.json', 'mobile/package-lock.json']) {
    assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD', '--', f], { cwd: repo, encoding: 'utf8' }).trim(), '', f);
  }
  const head = JSON.parse(execFileSync('git', ['show', 'HEAD:mobile/package.json'], { cwd: repo, encoding: 'utf8' }));
  const now = JSON.parse(read('../package.json'));
  assert.deepEqual(now.dependencies, head.dependencies);
  assert.deepEqual(now.devDependencies, head.devDependencies);
});
