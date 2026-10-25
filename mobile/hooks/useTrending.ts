import { useQuery } from '@tanstack/react-query';

import { activePollsKey, fetchActivePolls, fetchTrending, trendingKey } from '@/lib/postLists';
import { useAuthStore } from '@/stores/authStore';

// The server ranking refreshes every 5 minutes; a minute here keeps tab switches instant.
const STALE_MS = 60 * 1000;

/** Trending posts (guests too). Refetched on focus / foreground by the list when stale. */
export function useTrendingPosts() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({ queryKey: trendingKey(userId), queryFn: fetchTrending, staleTime: STALE_MS });
}

/** Open polls, most votes first (guests too). */
export function useActivePolls() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({ queryKey: activePollsKey(userId), queryFn: fetchActivePolls, staleTime: STALE_MS });
}
