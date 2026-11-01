import { skipToken, useInfiniteQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { type KeysetCursor, nextReportsCursor, type ReportQueueItem, toReportQueueItem } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-reports' (the queue) and 'mod-report' (one item): not persisted, cleared on sign-out (clearMemberCaches).
export const moderationReportsKey = (userId: string) => ['mod-reports', userId] as const;

const PAGE = 20;

type ReportsPage = { items: ReportQueueItem[]; nextCursor: KeysetCursor | null };

/** One mod_get_reports call: oldest first report first, keyset after (first report, target id). */
export async function fetchReportRows(limit: number, cursor: KeysetCursor | null) {
  const { data, error } = await supabase.rpc('mod_get_reports', {
    p_limit: limit,
    ...(cursor ? { p_after_ts: cursor.ts, p_after_id: cursor.id } : {}),
  });
  if (error) {
    logError('rpc.mod_get_reports', error);
    throw error;
  }
  return data;
}

async function fetchReportsPage(cursor: KeysetCursor | null): Promise<ReportsPage> {
  const rows = await fetchReportRows(PAGE, cursor);
  return { items: rows.flatMap((r) => toReportQueueItem(r) ?? []), nextCursor: nextReportsCursor(rows, PAGE) };
}

/** Items with open reports, oldest first (staff only), 20 per page. */
export function useModerationReports() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useInfiniteQuery({
    queryKey: moderationReportsKey(userId ?? ''),
    queryFn: isStaff ? ({ pageParam }) => fetchReportsPage(pageParam) : skipToken,
    initialPageParam: null as KeysetCursor | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60 * 1000,
  });
}
