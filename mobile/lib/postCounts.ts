import type { QueryClient } from '@tanstack/react-query';

import type { FeedData } from '@/lib/feed';
import { type FeedPost, type PollOption, parsePollOptions } from '@/lib/posts';
import type { Json } from '@/types/database';

export type PostCounts = {
  id: string | null;
  reaction_count: number | null;
  comment_count: number | null;
  /** Polls only: fresh results and my vote. */
  poll_options?: Json | null;
  my_vote?: string | null;
};

export const postQueryKey = (postId: string, userId: string | null) => ['post', postId, userId ?? 'guest'] as const;

function sameOptions(a: readonly PollOption[], b: readonly PollOption[] | null): boolean {
  return !!b && a.length === b.length && a.every((o, i) => o.id === b[i]?.id && o.votes === b[i]?.votes && o.label === b[i]?.label);
}

function applyCounts(post: FeedPost, byId: Map<string, PostCounts>, skipPoll: (postId: string) => boolean): FeedPost {
  const counts = byId.get(post.id);
  if (!counts) return post;
  const reaction_count = counts.reaction_count ?? post.reaction_count;
  const comment_count = counts.comment_count ?? post.comment_count;
  let { poll_options, my_vote } = post;
  if (post.kind === 'poll' && counts.poll_options !== undefined && !skipPoll(post.id)) {
    const fresh = parsePollOptions(counts.poll_options);
    if (fresh && !sameOptions(fresh, poll_options)) poll_options = fresh;
    if (counts.my_vote !== undefined) my_vote = counts.my_vote;
  }
  if (
    reaction_count === post.reaction_count &&
    comment_count === post.comment_count &&
    poll_options === post.poll_options &&
    my_vote === post.my_vote
  ) {
    return post;
  }
  return { ...post, reaction_count, comment_count, poll_options, my_vote };
}

/**
 * Writes fresh counts (and poll results) into every cached feed and post-detail entry.
 * Unchanged posts keep their identity. `skipPoll` keeps the poll data of posts with a local vote in flight.
 */
export function mergePostCounts(
  queryClient: QueryClient,
  rows: readonly PostCounts[],
  skipPoll: (postId: string) => boolean = () => false,
): void {
  const byId = new Map<string, PostCounts>();
  for (const row of rows) if (row.id) byId.set(row.id, row);
  if (byId.size === 0) return;

  queryClient.setQueriesData<FeedData>({ queryKey: ['feed'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      const items = page.items.map((p) => applyCounts(p, byId, skipPoll));
      if (items.some((p, i) => p !== page.items[i])) {
        changed = true;
        return { ...page, items };
      }
      return page;
    });
    return changed ? { ...data, pages } : data;
  });

  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['post'] }, (post) =>
    post ? applyCounts(post, byId, skipPoll) : post,
  );
}

/** comment_count += delta (never below 0) on every cached feed row and post detail for this post. */
export function bumpCommentCount(queryClient: QueryClient, postId: string, delta: number): void {
  const bump = (post: FeedPost): FeedPost => ({ ...post, comment_count: Math.max(0, post.comment_count + delta) });
  queryClient.setQueriesData<FeedData>({ queryKey: ['feed'] }, (data) => {
    if (!data || !data.pages.some((page) => page.items.some((p) => p.id === postId))) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: page.items.map((p) => (p.id === postId ? bump(p) : p)) })),
    };
  });
  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['post', postId] }, (post) => (post ? bump(post) : post));
}
