import { skipToken, useQuery } from '@tanstack/react-query';

import { type Badge, toBadges } from '@/lib/badges';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'badges': not persisted, cleared on sign-out (clearMemberCaches), refetched after a block or unblock.
export const userBadgesKey = (viewerId: string, userId: string) => ['badges', viewerId, userId] as const;

/** A member's badges (get_user_badges). Signed-in only; `userId` null skips the query. */
export function useUserBadges(userId: string | null) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useQuery({
    queryKey: userBadgesKey(viewerId ?? '', userId ?? ''),
    queryFn:
      viewerId && userId
        ? async (): Promise<Badge[]> => {
            const { data, error } = await supabase.rpc('get_user_badges', { p_user: userId });
            if (error) {
              logError('rpc.get_user_badges', error);
              throw error;
            }
            return toBadges(data);
          }
        : skipToken,
    staleTime: 5 * 60 * 1000,
  });
  return {
    badges: query.data ?? [],
    loading: query.isPending && userId !== null && viewerId !== null,
    error: query.isError,
    retry: () => void query.refetch(),
  };
}
