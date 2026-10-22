import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { type FeedPost, parsePosts } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

export const FEED_PAGE_SIZE = 20;

export type FeedCursor = { ts: string; id: string };
/** nextCursor is fixed at fetch time, so filtering items later never ends paging early. */
export type FeedPage = { items: FeedPost[]; nextCursor: FeedCursor | null };
export type FeedData = InfiniteData<FeedPage, FeedCursor | null>;

/** Per viewer, because rows carry my_reaction and my_vote. */
export const feedQueryKey = (userId: string | null) => ['feed', userId ?? 'guest'] as const;

export async function fetchFeedPage(cursor: FeedCursor | null): Promise<FeedPage> {
  const { data, error } = await supabase.rpc('get_feed', {
    p_before_ts: cursor?.ts,
    p_before_id: cursor?.id,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw error;
  const items = parsePosts(data);
  const last = items.at(-1);
  // Keyset cursor: the last row's (published_at, id). A short page means the end.
  const nextCursor = data.length === FEED_PAGE_SIZE && last ? { ts: last.published_at, id: last.id } : null;
  return { items, nextCursor };
}

/**
 * Puts a freshly fetched first page on top and removes its posts from the older
 * pages. If it does not overlap what is loaded (more than a page of new posts),
 * the older pages would leave a gap, so the feed restarts from the fresh page.
 */
export function mergeFirstPage(data: FeedData | undefined, fresh: FeedPage): FeedData {
  const freshIds = new Set(fresh.items.map((p) => p.id));
  const overlaps = data?.pages.some((page) => page.items.some((p) => freshIds.has(p.id))) ?? false;
  if (!data || !overlaps || fresh.nextCursor === null) return { pages: [fresh], pageParams: [null] };
  return {
    pages: [fresh, ...data.pages.map((page) => ({ ...page, items: page.items.filter((p) => !freshIds.has(p.id)) }))],
    pageParams: [null, ...data.pageParams],
  };
}

/** Fetches page 1 and merges it into the cached feed, without a loading state. */
export async function refreshFeedTop(queryClient: QueryClient, userId: string | null): Promise<void> {
  const fresh = await fetchFeedPage(null);
  queryClient.setQueryData<FeedData>(feedQueryKey(userId), (data) => mergeFirstPage(data, fresh));
}
