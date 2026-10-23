import { skipToken, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchMyPostsPage, MY_POSTS_START, type MyPostsCursor } from '@/lib/myPosts';
import { useAuthStore } from '@/stores/authStore';

/** The signed-in user's posts and listings in every status, newest first. */
export function useMyPosts() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useInfiniteQuery({
    queryKey: ['my-posts', userId ?? ''],
    queryFn: userId ? ({ pageParam }) => fetchMyPostsPage(userId, pageParam) : skipToken,
    initialPageParam: MY_POSTS_START as MyPostsCursor,
    getNextPageParam: (lastPage) => lastPage.next,
    staleTime: 0,
  });
  const items = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);
  return { query, items };
}
