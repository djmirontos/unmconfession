import type { InfiniteData } from '@tanstack/react-query';

import { getReactionErrorMessage } from '@/lib/errors';
import { createLatestOnlyQueue } from '@/lib/latestOnlyQueue';
import { logError } from '@/lib/log';
import type { MyPostsPage } from '@/lib/myPosts';
import { updateListedPost } from '@/lib/postLists';
import type { FeedPost } from '@/lib/posts';
import { queryClient } from '@/lib/queryClient';
import { breakdownTally, clusterOf, type ReactionType, reactWithCluster } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/stores/toastStore';
import type { Database } from '@/types/database';

type Reaction = ReactionType | null;

/**
 * My reaction, the total and the cluster together (lib/reactionTally.ts): exact when the post's
 * per-type counts are known, a close estimate otherwise; the server's counts follow right after.
 */
function withReaction(post: FeedPost, next: Reaction): FeedPost {
  if (post.my_reaction === next) return post;
  const r = reactWithCluster(
    { tally: post.reaction_breakdown ?? null, top: post.top_reactions, total: post.reaction_count, mine: post.my_reaction },
    next,
  );
  return { ...post, my_reaction: next, reaction_count: r.total, top_reactions: r.top, reaction_breakdown: r.tally };
}

// Bumped on every local change: a server read started before a newer tap must not overwrite it.
const versions = new Map<string, number>();

/** After the server confirmed my reaction: that one post's exact counts and cluster (not the whole feed). */
async function reconcile(postId: string): Promise<void> {
  const version = versions.get(postId);
  const { data, error } = await supabase.from('posts').select('reaction_count, reaction_breakdown').eq('id', postId).maybeSingle();
  if (error || !data || versions.get(postId) !== version) return;
  const tally = breakdownTally(data.reaction_breakdown);
  if (!tally) return;
  const exact = (post: FeedPost): FeedPost => ({
    ...post,
    reaction_count: data.reaction_count,
    top_reactions: clusterOf(tally),
    reaction_breakdown: tally,
  });
  updateListedPost(queryClient, postId, exact);
  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['post', postId] }, (post) => (post ? exact(post) : post));
  // My Posts (my own post reacted to elsewhere): read-only cards, so only the server's counts are written.
  queryClient.setQueriesData<InfiniteData<MyPostsPage>>({ queryKey: ['my-posts'] }, (data) =>
    data && data.pages.some((page) => page.items.some((item) => item.feedPost?.id === postId))
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.feedPost?.id === postId ? { ...item, feedPost: exact(item.feedPost) } : item)),
          })),
        }
      : data,
  );
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
  void reconcile(postId);
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
  versions.set(postId, (versions.get(postId) ?? 0) + 1);
  patchCaches(postId, next);
  void queue(postId, current, next);
}
