// Run with: npm run test:answers  (Node 22.6+ strips the TypeScript types of the import)
// v1.0.3 Q&A posts: the feed row schema, answer counts and their wording, the Create chips.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// lib/feedPostSchema.ts imports '@/lib/...' (tsconfig paths).
register('./aliasHook.mjs', import.meta.url);
const A = await import('../lib/answers.ts');
const { feedPostSchema } = await import('../lib/feedPostSchema.ts');
const { postKindWord, postWord } = await import('../lib/postKindWord.ts');
const { CREATE_KINDS } = await import('../lib/createKinds.ts');

// A feed_posts row as the view returned it before v1.0.3 (no post_type, no answer_count).
const oldRow = {
  id: 'p1',
  number: 12,
  kind: 'confession',
  body: 'Hello',
  target_name: null,
  images: [],
  ends_at: null,
  author_id: 'u1',
  nickname: 'kenshin',
  avatar_key: null,
  published_at: '2026-11-02T10:00:00Z',
  reaction_count: 3,
  comment_count: 5,
  my_reaction: null,
  poll_options: null,
  my_vote: null,
  edited_at: null,
  top_reactions: ['like'],
};

// ---------------------------------------------------------------- feed row schema

test('a row without the new columns still parses, as a normal post with no answers', () => {
  const r = feedPostSchema.safeParse(oldRow);
  assert.equal(r.success, true);
  assert.equal(r.data.postType, 'post');
  assert.equal(r.data.answerCount, 0);
  assert.equal(r.data.comment_count, 5);
});

test('post_type and answer_count map to postType and answerCount (snake_case keys dropped)', () => {
  const r = feedPostSchema.parse({ ...oldRow, post_type: 'qa', answer_count: 2 });
  assert.equal(r.postType, 'qa');
  assert.equal(r.answerCount, 2);
  assert.equal('post_type' in r, false);
  assert.equal('answer_count' in r, false);
});

test('unknown post types and bad answer counts fall back instead of dropping the row', () => {
  for (const [post_type, answer_count] of [
    ['poll', -1],
    [null, 1.5],
    ['QA', '3'],
    [undefined, null],
  ]) {
    const r = feedPostSchema.safeParse({ ...oldRow, post_type, answer_count });
    assert.equal(r.success, true, `${post_type} / ${answer_count}`);
    assert.equal(r.data.postType, 'post');
    assert.equal(r.data.answerCount, 0);
  }
});

test('toPostType: only "qa" is Q&A', () => {
  assert.equal(A.toPostType('qa'), 'qa');
  for (const v of ['post', 'QA', '', null, undefined, 1]) assert.equal(A.toPostType(v), 'post', String(v));
});

// ---------------------------------------------------------------- wording

test('answersLabel: 0, 1, 2', () => {
  assert.equal(A.answersLabel(0), '0 answers');
  assert.equal(A.answersLabel(1), '1 answer');
  assert.equal(A.answersLabel(2), '2 answers');
});

test('postWord: a Q&A post reads "question", everything else as before', () => {
  assert.equal(postWord('confession', 'qa'), 'question');
  assert.equal(postWord('confession', 'post'), 'post');
  assert.equal(postWord('confession', null), 'post');
  assert.equal(postWord('shoutout', 'post'), 'shoutout');
  assert.equal(postWord('poll', undefined), 'poll');
  // Only a post can be Q&A: shoutouts and polls never read "question".
  assert.equal(postWord('shoutout', 'qa'), 'shoutout');
  assert.equal(postWord('poll', 'qa'), 'poll');
  // postKindWord (notifications) ignores the type: Q&A notifications still say "post".
  assert.equal(postKindWord('confession'), 'post');
});

// ---------------------------------------------------------------- count rules (same as the database)

const post = (comment_count, answerCount) => ({ id: 'p1', comment_count, answerCount });

test('a new top-level comment is a comment and an answer; a reply is only a comment', () => {
  assert.deepEqual(A.applyCountDelta(post(5, 2), A.addedDelta(true)), post(6, 3));
  assert.deepEqual(A.applyCountDelta(post(5, 2), A.addedDelta(false)), post(6, 2));
});

test('removing a reply lowers only the comment count', () => {
  assert.deepEqual(A.applyCountDelta(post(5, 2), A.removedDelta(false)), post(4, 2));
});

test('removing a top-level comment takes its replies from the comment count, one answer', () => {
  assert.deepEqual(A.applyCountDelta(post(5, 2), A.removedDelta(true, 2)), post(2, 1));
  // Held after an edit: its replies stay, so only the comment itself goes.
  assert.deepEqual(A.applyCountDelta(post(5, 2), A.removedDelta(true)), post(4, 1));
  assert.deepEqual(A.removedDelta(true, -3), { comments: -1, answers: -1 });
});

test('counts never go below 0, and other fields are kept', () => {
  assert.deepEqual(A.applyCountDelta(post(0, 0), A.removedDelta(true, 4)), post(0, 0));
  const withExtra = { ...post(1, 1), body: 'x' };
  assert.equal(A.applyCountDelta(withExtra, A.addedDelta(true)).body, 'x');
});

// ---------------------------------------------------------------- Create chips

test('Create chips: Post | Q&A | Shoutout | Poll | Sell | Lost & Found', () => {
  assert.deepEqual(
    CREATE_KINDS.map((k) => k.label),
    ['Post', 'Q&A', 'Shoutout', 'Poll', 'Sell', 'Lost & Found'],
  );
  assert.deepEqual(
    CREATE_KINDS.map((k) => k.value),
    ['confession', 'qa', 'shoutout', 'poll', 'sell', 'lost_found'],
  );
});
