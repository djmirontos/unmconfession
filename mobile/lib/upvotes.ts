// Upvotes on Q&A answers (v1.0.3). Pure, no imports (tests/upvotes.test.mjs).
// An answer is a published top-level comment on a Q&A post. The server (set_answer_upvote)
// re-checks everything; the order of answers never depends on upvotes.

export type UpvoteState = { upvoteCount: number; myUpvote: boolean };

/** thread_comments.upvote_count; missing (older rows) or invalid counts as 0. */
export const toUpvoteCount = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

/** thread_comments.my_upvote; anything but true is "not upvoted". */
export const toMyUpvote = (value: unknown): boolean => value === true;

/** The upvote button replaces the reaction button only on top-level comments of a Q&A post. */
export const showsUpvote = (qaThread: boolean, parentId: string | null): boolean => qaThread && parentId === null;

/** What a tap may do: send it, or explain why not (guests get the sign-in sheet from the caller). */
export type UpvoteCheck = 'ok' | 'own' | 'not_answer';

export function checkUpvote(input: { qaThread: boolean; parentId: string | null; authorId: string; myId: string | null }): UpvoteCheck {
  if (!showsUpvote(input.qaThread, input.parentId)) return 'not_answer';
  if (input.myId !== null && input.authorId === input.myId) return 'own';
  return 'ok';
}

/** Optimistic toggle: the count moves with my vote, never below 0. Same vote again: unchanged. */
export function toggleUpvote<T extends UpvoteState>(state: T, next: boolean): T {
  if (state.myUpvote === next) return state;
  return { ...state, myUpvote: next, upvoteCount: Math.max(0, state.upvoteCount + (next ? 1 : -1)) };
}

/** After the server answered: its count wins over the optimistic one (my vote stays as sent). */
export function withServerCount<T extends UpvoteState>(state: T, serverCount: unknown): T {
  const count = toUpvoteCount(serverCount);
  return state.upvoteCount === count ? state : { ...state, upvoteCount: count };
}

/** "0 upvotes", "1 upvote", "2 upvotes". */
export const upvotesLabel = (count: number): string => `${count} ${count === 1 ? 'upvote' : 'upvotes'}`;

/** Screen-reader label of the button: what a tap does, then the count. */
export const upvoteA11yLabel = (state: UpvoteState): string =>
  `${state.myUpvote ? 'Remove upvote' : 'Upvote'}, ${upvotesLabel(state.upvoteCount)}`;
