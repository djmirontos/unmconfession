import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { logError } from '@/lib/log';
import { isReactionType, type ReactionType } from '@/lib/reactions';
import { nextCursor, REACTORS_PAGE_SIZE, type ReactorsCursor } from '@/lib/reactors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { type ReactorsTarget, useReactorsSheetStore } from '@/stores/reactorsSheetStore';
import type { Database } from '@/types/database';

type Fn = Database['public']['Functions'];
export type Reactor = Fn['get_post_reactors']['Returns'][number];
export type ReactorType = ReactionType | 'all';

// Under ['reactors', type, id, …]: not persisted, cleared on sign-out (clearMemberCaches),
// refetched after my own reaction on the item changes and after a block or unblock.
export const reactorsKey = (target: ReactorsTarget) => ['reactors', target.type, target.id] as const;

/** Opens the "who reacted" sheet; guests get the sign-in sheet. */
export function useOpenReactors() {
  const requireAuth = useRequireAuth();
  const open = useReactorsSheetStore((s) => s.open);
  return useCallback(
    (target: ReactorsTarget) => {
      if (requireAuth('reactors')) open(target);
    },
    [requireAuth, open],
  );
}

/** Totals per reaction type for the tabs (highest first). */
export function useReactorCounts(target: ReactorsTarget | null) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: target ? [...reactorsKey(target), 'counts', viewerId ?? ''] : ['reactors', 'none'],
    queryFn:
      target && viewerId
        ? async (): Promise<{ type: ReactionType; total: number }[]> => {
            const { data, error } =
              target.type === 'post'
                ? await supabase.rpc('get_post_reactor_counts', { p_post_id: target.id })
                : await supabase.rpc('get_comment_reactor_counts', { p_comment_id: target.id });
            if (error) {
              logError('rpc.reactor_counts', error, { type: target.type });
              throw error;
            }
            return data.filter((r) => isReactionType(r.type));
          }
        : skipToken,
  });
}

async function fetchReactorsPage(target: ReactorsTarget, type: ReactorType, cursor: ReactorsCursor | null): Promise<Reactor[]> {
  const page = {
    ...(type === 'all' ? {} : { p_type: type }),
    ...(cursor ? { p_before_ts: cursor.before_ts, p_before_user: cursor.before_user } : {}),
    p_limit: REACTORS_PAGE_SIZE,
  };
  const { data, error } =
    target.type === 'post'
      ? await supabase.rpc('get_post_reactors', { p_post_id: target.id, ...page })
      : await supabase.rpc('get_comment_reactors', { p_comment_id: target.id, ...page });
  if (error) {
    logError('rpc.reactors', error, { type: target.type });
    throw error;
  }
  return data;
}

/** Who reacted (one tab), newest first, keyset-paged on (reacted_at, user_id). */
export function useReactors(target: ReactorsTarget | null, type: ReactorType) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useInfiniteQuery({
    queryKey: target ? [...reactorsKey(target), 'list', type, viewerId ?? ''] : ['reactors', 'none', type],
    queryFn: target && viewerId ? ({ pageParam }) => fetchReactorsPage(target, type, pageParam) : skipToken,
    initialPageParam: null as ReactorsCursor | null,
    getNextPageParam: (lastPage) => nextCursor(lastPage),
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: Reactor[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const row of page) {
        if (seen.has(row.user_id)) continue;
        seen.add(row.user_id);
        out.push(row);
      }
    }
    return out;
  }, [query.data]);

  return { query, rows };
}
