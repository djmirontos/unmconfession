import { skipToken, useQuery } from '@tanstack/react-query';

import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-open-reports': not persisted, cleared on sign-out (clearMemberCaches).
export const openReportCountKey = (userId: string) => ['mod-open-reports', userId] as const;

async function fetchOpenReportCount(): Promise<number> {
  const { data, error } = await supabase.rpc('mod_open_report_count');
  if (error) {
    logError('rpc.mod_open_report_count', error);
    throw error;
  }
  return data;
}

/** Reported items with an open report (staff only). Refetched on screen focus and app foreground once stale. */
export function useOpenReportCount() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  const query = useQuery({
    queryKey: openReportCountKey(userId ?? ''),
    queryFn: isStaff ? fetchOpenReportCount : skipToken,
    staleTime: 60 * 1000,
  });
  useRefetchWhenStale(query, isStaff);
  return query;
}
