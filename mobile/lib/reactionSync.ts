import { getReactionErrorMessage } from '@/lib/errors';
import { createLatestOnlyQueue } from '@/lib/latestOnlyQueue';
import { logError } from '@/lib/log';
import { updateListedPost } from '@/lib/postLists';
import type { FeedPost } from '@/lib/posts';
import { queryClient } from '@/lib/queryClient';
import { approxTopReactions, type ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/stores/toastStore';
import type { Database } from '@/types/database';

type Reaction = ReactionType | null;

/** none -> reaction: +1; A -> B: unchanged; reaction -> none: -1 (never below 0). Top 3 approximated. */
function withReaction(post: FeedPost, next: Reaction): FeedPost {
  const prev = post.my_reaction;
  if (prev === next) return post;
  const delta = prev === null ? 1 : next === null ? -1 : 0;
  const reaction_count = Math.max(0, post.reaction_count + delta);
  return {
    ...post,
    my_reaction: next,
    reaction_count,
    top_reactions: approxTopReactions(post.top_reactions, prev, next, reaction_count),
  };
}

/** Patches every cache holding the post: feed pages, Trending, active polls and the post detail. */
function patchCaches(postId: string, next: Reaction): void {
  updateListedPost(queryClient, postId, (p) => withReaction(p, next));
  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['post', postId] }, (post) =>
    post ? withReaction(post, next) : post,
  );
}

async function sendReaction(postId: string, type: Reaction): Promise<void> {
  // set_reaction removes the reaction for null; the generated types cannot express a nullable enum argument.
  const args = { p_post_id: postId, p_type: type } as unknown as Database['public']['Functions']['set_reaction']['Args'];
  const { error } = await supabase.rpc('set_reaction', args);
  if (error) {
    logError('rpc.set_reaction', error, { postId, type });
    throw error;
  }
  // The "who reacted" sheet for this post (reactorsKey in hooks/useReactors.ts).
  void queryClient.invalidateQueries({ queryKey: ['reactors', 'post', postId] });
}

// Requests per post run one at a time; while one runs only the latest wanted reaction is kept.
const queue = createLatestOnlyQueue<Reaction>(sendReaction, (postId, error, lastConfirmed) => {
  patchCaches(postId, lastConfirmed);
  useToastStore.getState().show(getReactionErrorMessage(error));
});

/**
 * Sets (or with null removes) my reaction on a post. The caches change at once,
 * the server call is serialized per post, and on failure the caches roll back to
 * the last value the server confirmed. No feed invalidation: the 30-second counts
 * refresh reconciles totals.
 */
export function setReaction(postId: string, current: Reaction, next: Reaction): void {
  patchCaches(postId, next);
  void queue(postId, current, next);
}
