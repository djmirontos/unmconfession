import { patchComment } from '@/lib/commentCache';
import type { ThreadComment } from '@/lib/comments';
import { getCommentReactionErrorMessage, getErrorCode } from '@/lib/errors';
import { createLatestOnlyQueue } from '@/lib/latestOnlyQueue';
import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { approxTopReactions, type ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/stores/toastStore';
import type { Database } from '@/types/database';

type Reaction = ReactionType | null;

/** none -> reaction: +1; A -> B: unchanged; reaction -> none: -1 (never below 0). */
function withReaction(comment: ThreadComment, next: Reaction): ThreadComment {
  const prev = comment.myReaction;
  if (prev === next) return comment;
  const delta = prev === null ? 1 : next === null ? -1 : 0;
  const reactionCount = Math.max(0, comment.reactionCount + delta);
  // Top 3 approximated (see approxTopReactions); realtime rows and refetches bring the exact order.
  return {
    ...comment,
    myReaction: next,
    reactionCount,
    topReactions: approxTopReactions(comment.topReactions, prev, next, reactionCount),
  };
}

/** Patches the comment in every cached thread and replies list. Neither is persisted. */
function patchThreads(commentId: string, next: Reaction): void {
  patchComment(queryClient, commentId, (c) => withReaction(c, next));
}

async function sendReaction(commentId: string, type: Reaction): Promise<void> {
  // null removes the reaction; the generated types cannot express a nullable enum argument.
  const args = { p_comment_id: commentId, p_type: type } as unknown as Database['public']['Functions']['set_comment_reaction']['Args'];
  const { error } = await supabase.rpc('set_comment_reaction', args);
  if (error) {
    logError('rpc.set_comment_reaction', error, { commentId, type });
    throw error;
  }
}

// Comments with a reaction in flight, and when each last changed locally. Realtime
// counts for them are skipped so an event from before my change cannot undo it.
const pending = new Set<string>();
const touchedAt = new Map<string, number>();
const SETTLE_MS = 3000;

export function commentReactionBusy(commentId: string, now = Date.now()): boolean {
  return pending.has(commentId) || now - (touchedAt.get(commentId) ?? 0) < SETTLE_MS;
}

// One request per comment at a time; while one runs only the latest wanted reaction is kept.
const queue = createLatestOnlyQueue<Reaction>(sendReaction, (commentId, error, lastConfirmed) => {
  patchThreads(commentId, lastConfirmed);
  useToastStore.getState().show(getCommentReactionErrorMessage(error));
  // Gone, held or removed: the thread is out of date.
  if (getErrorCode(error) === 'not_found') {
    void queryClient.invalidateQueries({ queryKey: ['comments'] });
    void queryClient.invalidateQueries({ queryKey: ['replies'] });
  }
});

/**
 * Sets (or with null removes) my reaction on a comment: the thread cache changes
 * at once, requests are serialized per comment, and on failure the cache rolls
 * back to the last value the server confirmed.
 */
export function setCommentReaction(commentId: string, current: Reaction, next: Reaction): void {
  patchThreads(commentId, next);
  touchedAt.set(commentId, Date.now());
  const run = queue(commentId, current, next);
  if (!run) return;
  pending.add(commentId);
  void run.finally(() => {
    pending.delete(commentId);
    touchedAt.set(commentId, Date.now());
  });
}
