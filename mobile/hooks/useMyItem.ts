import { type InfiniteData, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchMyItem, type MyItem, type MyPostsPage } from '@/lib/myPosts';
import { useAuthStore } from '@/stores/authStore';

/**
 * One of the user's own posts or listings in any status. Paints from the My Posts
 * cache, then reads the row itself (RLS lets authors read their own rows).
 */
export function useMyItem(source: MyItem['source'] | null, id: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useQuery({
    queryKey: ['my-item', userId ?? '', source ?? '', id],
    queryFn: userId && source && id ? () => fetchMyItem(userId, source, id) : skipToken,
    placeholderData: () => {
      const cached = queryClient.getQueryData<InfiniteData<MyPostsPage>>(['my-posts', userId ?? '']);
      for (const page of cached?.pages ?? []) {
        const hit = page.items.find((i) => i.source === source && i.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
  });
}
