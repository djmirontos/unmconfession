import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { FeedData } from '@/lib/feed';
import { postQueryKey } from '@/lib/postCounts';
import { type FeedPost, parsePost } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

async function fetchPost(id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from('feed_posts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? parsePost(data) : null;
}

/**
 * One published post. Null when it does not exist or is no longer published.
 * Counts refresh via usePostCountsRefresh and on new comments (posts is not
 * in the Realtime publication).
 */
export function usePost(id: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useQuery({
    queryKey: postQueryKey(id, userId),
    queryFn: () => fetchPost(id),
    // Paint from the feed cache while the fresh row loads.
    placeholderData: () => {
      for (const [, data] of queryClient.getQueriesData<FeedData>({ queryKey: ['feed'] })) {
        for (const page of data?.pages ?? []) {
          const hit = page.items.find((p) => p.id === id);
          if (hit) return hit;
        }
      }
      return undefined;
    },
  });
}
