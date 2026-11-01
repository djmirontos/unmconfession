import { skipToken, useInfiniteQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { type HeldItem, nextHeldCursor, toHeldItem } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-held': not persisted, cleared on sign-out (clearMemberCaches).
export const heldQueueKey = (userId: string) => ['mod-held', userId] as const;

const PAGE = 20;

type HeldPage = { items: HeldItem[]; nextCursor: string | null };

async function fetchHeldPage(after: string | null): Promise<HeldPage> {
  const { data, error } = await supabase.rpc('mod_get_queue', { p_limit: PAGE, ...(after ? { p_after_ts: after } : {}) });
  if (error) {
    logError('rpc.mod_get_queue', error);
    throw error;
  }
  return { items: data.flatMap((r) => toHeldItem(r) ?? []), nextCursor: nextHeldCursor(data, PAGE) };
}

/** Held posts, comments and listings, oldest first (staff only), 20 per page. */
export function useHeldQueue() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useInfiniteQuery({
    queryKey: heldQueueKey(userId ?? ''),
    queryFn: isStaff ? ({ pageParam }) => fetchHeldPage(pageParam) : skipToken,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60 * 1000,
  });
}
