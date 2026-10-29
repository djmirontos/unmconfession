import type { QueryClient } from '@tanstack/react-query';

import type { FeedData } from '@/lib/feed';
import { logError } from '@/lib/log';
import { type FeedPost, parsePosts } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

export const TRENDING_LIMIT = 50;
export const ACTIVE_POLLS_LIMIT = 30;

// Per viewer (rows carry my_reaction / my_vote). Single-page lists, not persisted.
export const trendingKey = (userId: string | null) => ['trending', userId ?? 'guest'] as const;
export const activePollsKey = (userId: string | null) => ['polls', 'active', userId ?? 'guest'] as const;

/** Last 7 days, ranked server-side (refreshed every 5 minutes, so it can lag a little). */
export async function fetchTrending(): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc('get_trending', { p_limit: TRENDING_LIMIT });
  if (error) {
    logError('rpc.get_trending', error);
    throw error;
  }
  return parsePosts(data);
}

/** Polls still open, most votes first. */
export async function fetchActivePolls(): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc('get_active_polls', { p_limit: ACTIVE_POLLS_LIMIT });
  if (error) {
    logError('rpc.get_active_polls', error);
    throw error;
  }
  return parsePosts(data);
}

/** The changed list, or null when `change` returned every post as it was. */
function mapPosts(posts: readonly FeedPost[], change: (post: FeedPost) => FeedPost | null): FeedPost[] | null {
  let changed = false;
  const out: FeedPost[] = [];
  for (const post of posts) {
    const next = change(post);
    if (next !== post) changed = true;
    if (next) out.push(next);
  }
  return changed ? out : null;
}

/**
 * Applies `change` to every cached post list: the feed pages (every viewer's key),
 * members' profile pages, Trending and active polls. Returning null drops the post; returning it unchanged
 * keeps that list's identity, so untouched screens do not re-render. The post
 * detail cache is left to the caller.
 */
export function updateListedPosts(queryClient: QueryClient, change: (post: FeedPost) => FeedPost | null): void {
  const updatePages = (data: FeedData | undefined) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      const items = mapPosts(page.items, change);
      if (!items) return page;
      changed = true;
      return { ...page, items };
    });
    return changed ? { ...data, pages } : data;
  };
  queryClient.setQueriesData<FeedData>({ queryKey: ['feed'] }, updatePages);
  queryClient.setQueriesData<FeedData>({ queryKey: ['user-posts'] }, updatePages);
  for (const queryKey of [['trending'], ['polls']]) {
    queryClient.setQueriesData<FeedPost[]>({ queryKey }, (list) => (list ? (mapPosts(list, change) ?? list) : list));
  }
}

/** Same, for one post. */
export function updateListedPost(queryClient: QueryClient, postId: string, update: (post: FeedPost) => FeedPost | null): void {
  updateListedPosts(queryClient, (p) => (p.id === postId ? update(p) : p));
}
