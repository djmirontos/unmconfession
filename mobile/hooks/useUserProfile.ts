import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Profile } from '@/hooks/useProfile';
import type { FeedCursor } from '@/lib/feed';
import type { ListingCardData, ListingsCursor } from '@/lib/listings';
import { logError } from '@/lib/log';
import type { FeedPost } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { fetchUserListingsPage, userListingsKey } from '@/lib/userListings';
import { fetchUserPostsPage, userPostsKey } from '@/lib/userPosts';
import { useAuthStore } from '@/stores/authStore';

export const userProfileKey = (id: string) => ['user-profile', id] as const;
export const blockedByMeKey = (viewerId: string, id: string) => ['blocked-by-me', viewerId, id] as const;

/** Another member's public row; null when there is none. `id` null skips the query. */
export function useUserProfile(id: string | null) {
  return useQuery({
    queryKey: userProfileKey(id ?? ''),
    queryFn: id
      ? async (): Promise<Profile | null> => {
          const { data, error } = await supabase.from('profiles').select('id, nickname, avatar_key').eq('id', id).maybeSingle();
          if (error) {
            logError('userProfile.fetch', error);
            throw error;
          }
          return data;
        }
      : skipToken,
  });
}

/** Whether I blocked this member (my own user_blocks rows only). */
export function useBlockedByMe(id: string | null) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: blockedByMeKey(viewerId ?? '', id ?? ''),
    queryFn:
      viewerId && id
        ? async (): Promise<boolean> => {
            const { data, error } = await supabase
              .from('user_blocks')
              .select('blocked_id')
              .eq('blocker_id', viewerId)
              .eq('blocked_id', id)
              .eq('kind', 'block')
              .maybeSingle();
            if (error) {
              logError('userProfile.blocked', error);
              throw error;
            }
            return data !== null;
          }
        : skipToken,
  });
}

/** Their posts, paged like the feed. `id` null skips the query (posts not shown in the current state). */
export function useUserPosts(id: string | null) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useInfiniteQuery({
    queryKey: userPostsKey(id ?? '', viewerId),
    queryFn: id ? ({ pageParam }) => fetchUserPostsPage(id, pageParam) : skipToken,
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // De-duplicated, as in the feed.
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

  return { query, posts };
}

/** Their listings (both kinds, closed ones too), paged like the posts. `id` null skips the query (tab not opened yet). */
export function useUserListings(id: string | null) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useInfiniteQuery({
    queryKey: userListingsKey(id ?? '', viewerId),
    queryFn: id ? ({ pageParam }) => fetchUserListingsPage(id, pageParam) : skipToken,
    initialPageParam: null as ListingsCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const listings = useMemo(() => {
    const seen = new Set<string>();
    const out: ListingCardData[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const listing of page.items) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        out.push(listing);
      }
    }
    return out;
  }, [query.data]);

  return { query, listings };
}
