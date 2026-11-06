// Why is my own content held? (v1.0.5). Pure rules, no imports (tests/holdReason.test.mjs).
//
// Rule: the author is told THAT the word filter held it, never WHICH word. The server
// (get_my_hold_reason, 20261106100000_hold_reason.sql) answers only for the caller's own pending
// post, comment or listing and never returns the matched word. Anything but 'keyword' (pre-moderation,
// no answer, a failed or slow call) keeps the texts the app showed before.

export type HoldTarget = 'post' | 'comment' | 'listing';
export type HoldReason = 'keyword' | 'pre_moderation';

export const KEYWORD_HOLD_TEXT = "This was held for review because it contains words that aren't allowed. A moderator will check it.";

/** The submit toast is upgraded only if the answer arrives within this time. */
export const HOLD_REASON_WAIT_MS = 2000;
export const HOLD_REASON_STALE_MS = 5 * 60 * 1000;

export const isHoldReason = (value: unknown): value is HoldReason => value === 'keyword' || value === 'pre_moderation';

/** Keyword holds get the filter line; everything else keeps the text shown today. */
export const holdNoticeText = (reason: unknown, fallback: string): string => (reason === 'keyword' ? KEYWORD_HOLD_TEXT : fallback);

/** Upgrade the toast only for a keyword answer that came in time, while our toast is still the one shown. */
export function shouldUpgradeToast(input: { reason: unknown; elapsedMs: number; stillShowing: boolean }): boolean {
  return input.reason === 'keyword' && input.stillShowing && input.elapsedMs >= 0 && input.elapsedMs <= HOLD_REASON_WAIT_MS;
}

/** Per member and item (never persisted; cleared on sign-out). */
export const holdReasonKey = (userId: string, type: HoldTarget, id: string) => ['hold-reason', userId, type, id] as const;
