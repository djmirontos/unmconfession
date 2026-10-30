import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { chunkIds, idsToFetch, resultsById, type TopBadge, toTopBadges } from '@/lib/badges';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// One chip per author (get_top_badges). Under 'top-badges': not persisted, cleared on sign-out
// (clearMemberCaches), refetched after a block or unblock. "No badge" (null) is cached too.
export const topBadgeKey = (viewerId: string, userId: string) => ['top-badges', viewerId, userId] as const;
const STALE_MS = 5 * 60 * 1000;

// Every id asked for within this window (a list's registration and the chips it renders) goes
// out together: one get_top_badges call per 100 ids, never one per row.
const WINDOW_MS = 30;

type Waiter = { resolve: (badge: TopBadge | null) => void; reject: (error: unknown) => void };
const queued = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  timer = null;
  const batch = new Map(queued);
  queued.clear();
  await Promise.all(
    chunkIds([...batch.keys()]).map(async (ids) => {
      const { data, error } = await supabase.rpc('get_top_badges', { p_users: ids });
      if (error) {
        // No ids in the log; the chips just stay absent.
        logError('rpc.get_top_badges', error);
        for (const id of ids) for (const w of batch.get(id) ?? []) w.reject(error);
        return;
      }
      const results = resultsById(ids, toTopBadges(data));
      for (const id of ids) for (const w of batch.get(id) ?? []) w.resolve(results.get(id) ?? null);
    }),
  );
}

function loadTopBadge(userId: string): Promise<TopBadge | null> {
  return new Promise((resolve, reject) => {
    const waiters = queued.get(userId);
    if (waiters) waiters.push({ resolve, reject });
    else queued.set(userId, [{ resolve, reject }]);
    timer ??= setTimeout(() => void flush(), WINDOW_MS);
  });
}

const queryOptions = (viewerId: string, userId: string) => ({
  queryKey: topBadgeKey(viewerId, userId),
  queryFn: (): Promise<TopBadge | null> => loadTopBadge(userId),
  staleTime: STALE_MS,
  retry: false,
});

/**
 * A list registers the authors it shows, so the whole page is asked for in one batch before
 * the rows mount. Ids already cached (badge or "no badge") are skipped. Guests ask nothing.
 */
export function useRegisterTopBadges(authorIds: readonly (string | null | undefined)[]) {
  const queryClient = useQueryClient();
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const signature = authorIds.join(',');

  useEffect(() => {
    if (!viewerId) return;
    const now = Date.now();
    const missing = idsToFetch(signature.split(','), (id) => {
      const state = queryClient.getQueryState(topBadgeKey(viewerId, id));
      return state?.fetchStatus === 'fetching' || (state?.status === 'success' && now - state.dataUpdatedAt < STALE_MS);
    });
    for (const id of missing) void queryClient.prefetchQuery(queryOptions(viewerId, id));
  }, [signature, viewerId, queryClient]);
}

/** The chip to show next to this author's nickname, or null (none, unknown yet, failed, or a guest). */
export function useTopBadge(userId: string | null): TopBadge | null {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const { data } = useQuery({
    queryKey: topBadgeKey(viewerId ?? '', userId ?? ''),
    queryFn: viewerId && userId ? (): Promise<TopBadge | null> => loadTopBadge(userId) : skipToken,
    staleTime: STALE_MS,
    retry: false,
  });
  return data ?? null;
}
