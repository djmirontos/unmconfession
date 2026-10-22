import type { QueryClient } from '@tanstack/react-query';

import type { FeedData } from '@/lib/feed';
import type { FeedPost } from '@/lib/posts';

export type PostCounts = { id: string | null; reaction_count: number | null; comment_count: number | null };

export const postQueryKey = (postId: string, userId: string | null) => ['post', postId, userId ?? 'guest'] as const;

function applyCounts(post: FeedPost, byId: Map<string, PostCounts>): FeedPost {
  const counts = byId.get(post.id);
  if (!counts) return post;
  const reaction_count = counts.reaction_count ?? post.reaction_count;
  const comment_count = counts.comment_count ?? post.comment_count;
  if (reaction_count === post.reaction_count && comment_count === post.comment_count) return post;
  return { ...post, reaction_count, comment_count };
}

/** Writes fresh counts into every cached feed and post-detail entry. Unchanged posts keep their identity. */
export function mergePostCounts(queryClient: QueryClient, rows: readonly PostCounts[]): void {
  const byId = new Map<string, PostCounts>();
  for (const row of rows) if (row.id) byId.set(row.id, row);
  if (byId.size === 0) return;

  queryClient.setQueriesData<FeedData>({ queryKey: ['feed'] }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      const items = page.items.map((p) => applyCounts(p, byId));
      if (items.some((p, i) => p !== page.items[i])) {
        changed = true;
        return { ...page, items };
      }
      return page;
    });
    return changed ? { ...data, pages } : data;
  });

  queryClient.setQueriesData<FeedPost | null>({ queryKey: ['post'] }, (post) => (post ? applyCounts(post, byId) : post));
}
