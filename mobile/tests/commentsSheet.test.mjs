// Run with: npm run test:commentssheet  (Node 22.6+ strips the TypeScript types of the import)
// The Feed comments sheet: snap heights, where a drag settles, the keyboard lift, the draft store.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register('./aliasHook.mjs', import.meta.url);
const S = await import('../lib/commentsSheet.ts');
const { useCommentDraftStore, commentDraftKey, isEmptyDraft } = await import('../stores/commentDraftStore.ts');
const { useCommentsSheetStore, closeCommentsSheet } = await import('../stores/commentsSheetStore.ts');

const H = 800;

// ---------------------------------------------------------------- snap heights

test('snap heights: about 60% and 92% of the window', () => {
  assert.deepEqual(S.snapHeights(H, 40), { half: 480, full: 736 });
});

test('the full height never goes under the status bar; half is never taller than full', () => {
  // Tall top inset: full is limited by the room left.
  assert.deepEqual(S.snapHeights(H, 100), { half: 480, full: 700 });
  // iOS keyboard of 340 px: room is 800 - 40 - 340 = 420, so both snaps are 420.
  assert.deepEqual(S.snapHeights(H, 40, 340), { half: 420, full: 420 });
  assert.deepEqual(S.snapHeights(100, 40, 500), { half: 0, full: 0 });
});

test('keyboard lift: iOS moves the sheet by the keyboard, Android leaves it to the window pan', () => {
  assert.equal(S.keyboardLift('ios', 336), 336);
  assert.equal(S.keyboardLift('ios', -5), 0);
  assert.equal(S.keyboardLift('android', 300), 0);
});

// ---------------------------------------------------------------- where a drag settles

const half = 480;
const full = 736;
const settle = (visible, velocityY = 0, canClose = true) => S.settleSheet({ visible, velocityY, half, full, canClose });

test('a short drag down from the half height snaps back', () => {
  assert.equal(settle(half - 50), 'half');
  assert.equal(settle(half), 'half');
});

test('dragging down past the threshold closes; the threshold is 25% of half, at least 80 px', () => {
  // 25% of 480 = 120.
  assert.equal(settle(half - 120), 'half');
  assert.equal(settle(half - 121), 'closed');
  // A small half height still needs 80 px.
  assert.equal(S.settleSheet({ visible: 200 - 79, velocityY: 0, half: 200, full: 400, canClose: true }), 'half');
  assert.equal(S.settleSheet({ visible: 200 - 81, velocityY: 0, half: 200, full: 400, canClose: true }), 'closed');
});

test('a fast fling down closes from the half height', () => {
  assert.equal(settle(half - 10, S.CLOSE_VELOCITY), 'closed');
  assert.equal(settle(half - 10, S.CLOSE_VELOCITY - 1), 'half');
});

test('between the snaps: the nearest wins, and a fling picks its direction', () => {
  assert.equal(settle(half + 100), 'half');
  assert.equal(settle(full - 100), 'full');
  assert.equal(settle(full - 100, S.SNAP_VELOCITY), 'half'); // fling down from near full: half, not closed
  assert.equal(settle(half + 10, -S.SNAP_VELOCITY), 'full');
  assert.equal(settle(half - 50, -S.SNAP_VELOCITY), 'full');
});

test('with the keyboard up it never closes', () => {
  assert.equal(settle(10, 5000, false), 'half');
  assert.equal(settle(half - 300, 0, false), 'half');
});

// ---------------------------------------------------------------- draft store

const comment = { id: 'c1', body: 'hi', parentId: null };
const draft = (over = {}) => ({ text: '', replyTo: null, editing: null, ...over });

test('drafts are kept per post and an empty one removes the entry', () => {
  const store = useCommentDraftStore.getState();
  const a = commentDraftKey('p1');
  const b = commentDraftKey('p2');
  assert.equal(a, 'post:p1');
  store.setDraft(a, draft({ text: 'half written' }));
  store.setDraft(b, draft({ replyTo: comment }));
  assert.equal(useCommentDraftStore.getState().drafts[a].text, 'half written');
  assert.equal(useCommentDraftStore.getState().drafts[b].replyTo, comment);
  // Sent or cleared: text '' and no target.
  useCommentDraftStore.getState().setDraft(a, draft());
  assert.equal(a in useCommentDraftStore.getState().drafts, false);
  assert.equal(b in useCommentDraftStore.getState().drafts, true);
});

test('isEmptyDraft: only whitespace and no reply or edit target', () => {
  assert.equal(isEmptyDraft(draft({ text: '  \n' })), true);
  assert.equal(isEmptyDraft(draft({ text: 'x' })), false);
  assert.equal(isEmptyDraft(draft({ editing: comment })), false);
});

test('clearDraft and clearAll (logout)', () => {
  const store = useCommentDraftStore.getState();
  store.setDraft('post:x', draft({ text: 'one' }));
  store.setDraft('post:y', draft({ text: 'two' }));
  useCommentDraftStore.getState().clearDraft('post:x');
  assert.deepEqual(Object.keys(useCommentDraftStore.getState().drafts).sort(), ['post:p2', 'post:y']);
  // Clearing what is not there keeps the same state object.
  const before = useCommentDraftStore.getState().drafts;
  useCommentDraftStore.getState().clearDraft('post:none');
  assert.equal(useCommentDraftStore.getState().drafts, before);
  useCommentDraftStore.getState().clearAll();
  assert.deepEqual(useCommentDraftStore.getState().drafts, {});
});

// ---------------------------------------------------------------- sheet store

test('opening another post replaces the open one; close empties it', () => {
  const first = { postId: 'p1', answers: false, expectedCount: 2 };
  const second = { postId: 'p2', answers: true, expectedCount: 0 };
  useCommentsSheetStore.getState().open(first);
  useCommentsSheetStore.getState().open(second);
  assert.equal(useCommentsSheetStore.getState().target, second);
  closeCommentsSheet();
  assert.equal(useCommentsSheetStore.getState().target, null);
});
