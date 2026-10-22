import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { type FeedCursor, fetchFeedPage, feedQueryKey, refreshFeedTop } from '@/lib/feed';
import type { FeedPost } from '@/lib/posts';
import { useAuthStore } from '@/stores/authStore';

/** Newest-first feed with keyset paging. The first page is persisted, so it paints instantly on open. */
export function useFeed() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  const query = useInfiniteQuery({
    queryKey: feedQueryKey(userId),
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Flattened and de-duplicated: a post can sit on two pages after a merge.
  const posts = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedPost[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const post of page.items) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
      }
    }
    return out;
  }, [query.data]);

  const refreshTop = useCallback(() => refreshFeedTop(queryClient, userId), [queryClient, userId]);

  return { query, posts, refreshTop };
}
