import { getErrorCode, getErrorMessage } from '@/lib/errors';
import type { FeedData } from '@/lib/feed';
import { createLatestOnlyQueue } from '@/lib/latestOnlyQueue';
import { logError } from '@/lib/log';
import type { FeedPost } from '@/lib/posts';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/stores/toastStore';

type Vote = string | null;

/** Moves my vote: the old option -1 (never below 0), the new one +1. */
function withVote(post: FeedPost, next: Vote): FeedPost {
  const prev = post.my_vote;
  if (prev === next || !post.poll_options) return post;
  const poll_options = post.poll_options.map((o) =>
    o.id === prev ? { ...o, votes: Math.max(0, o.votes - 1) } : o.id === next ? { ...o, votes: o.votes + 1 } : o,
  );
  return { ...post, my_vote: next, poll_options };
}

/** Applies `update` to the post in every cache holding it: feed pages (all viewers' keys) and the post detail. */
function patchCaches(postId: string, update: (post: FeedPost) => FeedPost): void {
  queryClient.setQueriesData<FeedData>({ queryKey: ['feed'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      if (!page.items.some((p) => p.id === postId)) return page;
      changed = true;
      return { ...page, items: page.items.map((p) => (p.id === postId ? update(p) : p)) };
    });
    return changed ? { ...data, pages } : data;
  });
  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['post', postId] }, (post) => (post ? update(post) : post));
}

async function sendVote(postId: string, optionId: Vote): Promise<void> {
  // The queue never sends null: a vote can be moved but not removed.
  if (optionId === null) return;
  const { error } = await supabase.rpc('vote_poll', { p_post_id: postId, p_option_id: optionId });
  if (error) {
    logError('rpc.vote_poll', error, { postId });
    throw error;
  }
}

// Polls with a vote being sent, and when each last changed locally. The counts
// refresh skips their poll data so a response from before the vote cannot undo it.
const pending = new Set<string>();
const touchedAt = new Map<string, number>();

/** True while a vote on this poll is in flight or settled after `since` (ms). */
export function pollVoteTouchedSince(postId: string, since: number): boolean {
  return pending.has(postId) || (touchedAt.get(postId) ?? 0) >= since;
}

// Requests per poll run one at a time; while one runs only the latest wanted option is kept.
const queue = createLatestOnlyQueue<Vote>(sendVote, (postId, error, lastConfirmed) => {
  patchCaches(postId, (post) => withVote(post, lastConfirmed));
  if (getErrorCode(error) === 'poll_closed') {
    const now = new Date().toISOString();
    patchCaches(postId, (post) => ({ ...post, ends_at: now }));
  }
  useToastStore.getState().show(getErrorMessage(error));
});

/**
 * Votes for (or moves my vote to) an option. The caches change at once, the
 * server call is serialized per poll, and on failure the caches roll back to the
 * last vote the server confirmed. No feed invalidation: the 30-second counts
 * refresh reconciles other people's votes.
 */
export function votePoll(postId: string, current: Vote, next: string): void {
  patchCaches(postId, (post) => withVote(post, next));
  touchedAt.set(postId, Date.now());
  const run = queue(postId, current, next);
  if (!run) return;
  pending.add(postId);
  void run.finally(() => {
    pending.delete(postId);
    touchedAt.set(postId, Date.now());
  });
}
