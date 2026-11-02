// Q&A posts (v1.0.3): post type, answer counts and their wording. Pure, no imports
// (tests/answers.test.mjs). A Q&A post is kind 'confession' with posts.post_type = 'qa'.

export const POST_TYPES = ['post', 'qa'] as const;
export type PostType = (typeof POST_TYPES)[number];

/** posts.post_type is plain text in the generated types; anything unknown is a normal post. */
export const toPostType = (value: unknown): PostType => (value === 'qa' ? 'qa' : 'post');

/** "0 answers", "1 answer", "2 answers". */
export const answersLabel = (count: number): string => `${count} ${count === 1 ? 'answer' : 'answers'}`;

/** How a post's two counters move: comment_count counts every published comment, answerCount top-level ones only. */
export type CountDelta = { comments: number; answers: number };

/** A published comment appears (sent, or arrived live): a top-level one is also an answer. */
export const addedDelta = (topLevel: boolean): CountDelta => ({ comments: 1, answers: topLevel ? 1 : 0 });

/** A published comment goes (deleted, or held after an edit). A top-level one takes its published replies with it. */
export const removedDelta = (topLevel: boolean, replies = 0): CountDelta =>
  topLevel ? { comments: -(1 + Math.max(0, replies)), answers: -1 } : { comments: -1, answers: 0 };

/** Applies a delta, never below 0. */
export function applyCountDelta<T extends { comment_count: number; answerCount: number }>(post: T, delta: CountDelta): T {
  return {
    ...post,
    comment_count: Math.max(0, post.comment_count + delta.comments),
    answerCount: Math.max(0, post.answerCount + delta.answers),
  };
}
