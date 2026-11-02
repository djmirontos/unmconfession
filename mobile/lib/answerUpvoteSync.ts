import { patchComment } from '@/lib/commentCache';
import { getErrorCode, getUpvoteErrorMessage } from '@/lib/errors';
import { createLatestOnlyQueue } from '@/lib/latestOnlyQueue';
import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { toggleUpvote, withServerCount } from '@/lib/upvotes';
import { useToastStore } from '@/stores/toastStore';

// Same pattern as lib/commentReactionSync.ts, for a yes/no vote on a Q&A answer.

// Bumped on every local tap: a server answer to an older tap must not overwrite a newer one.
const versions = new Map<string, number>();

async function sendUpvote(commentId: string, on: boolean): Promise<void> {
  const version = versions.get(commentId);
  const { data, error } = await supabase.rpc('set_answer_upvote', { p_comment_id: commentId, p_on: on });
  if (error) {
    logError('rpc.set_answer_upvote', error, { on });
    throw error;
  }
  // The server's count wins, unless I tapped again since this request left.
  if (versions.get(commentId) === version) patchComment(queryClient, commentId, (c) => withServerCount(c, data));
}

// Answers with an upvote in flight, and when each last changed locally. Realtime counts for
// them are skipped so an event from before my change cannot undo it.
const pending = new Set<string>();
const touchedAt = new Map<string, number>();
const SETTLE_MS = 3000;

export function answerUpvoteBusy(commentId: string, now = Date.now()): boolean {
  return pending.has(commentId) || now - (touchedAt.get(commentId) ?? 0) < SETTLE_MS;
}

// One request per answer at a time; while one runs only the latest wanted vote is kept.
const queue = createLatestOnlyQueue<boolean>(sendUpvote, (commentId, error, lastConfirmed) => {
  patchComment(queryClient, commentId, (c) => toggleUpvote(c, lastConfirmed));
  useToastStore.getState().show(getUpvoteErrorMessage(error));
  // Gone, held or removed: the thread is out of date.
  if (getErrorCode(error) === 'not_found') {
    void queryClient.invalidateQueries({ queryKey: ['comments'] });
  }
});

/**
 * Upvotes (or removes my upvote on) an answer: the thread cache changes at once, requests are
 * serialized per answer, and on failure the cache rolls back to the last vote the server confirmed.
 */
export function setAnswerUpvote(commentId: string, current: boolean, next: boolean): void {
  versions.set(commentId, (versions.get(commentId) ?? 0) + 1);
  patchComment(queryClient, commentId, (c) => toggleUpvote(c, next));
  touchedAt.set(commentId, Date.now());
  const run = queue(commentId, current, next);
  if (!run) return;
  pending.add(commentId);
  void run.finally(() => {
    pending.delete(commentId);
    touchedAt.set(commentId, Date.now());
  });
}
