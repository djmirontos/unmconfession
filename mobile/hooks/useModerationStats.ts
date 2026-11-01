import { skipToken, useQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { type ModerationStats, toModerationStats } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-stats': not persisted, cleared on sign-out (clearMemberCaches).
export const moderationStatsKey = (userId: string) => ['mod-stats', userId] as const;

async function fetchModerationStats(): Promise<ModerationStats> {
  const { data, error } = await supabase.rpc('mod_app_stats');
  if (error) {
    logError('rpc.mod_app_stats', error);
    throw error;
  }
  const stats = toModerationStats(data);
  if (!stats) throw new Error('mod_app_stats returned no usable row');
  return stats;
}

/** Totals for the Moderation hub (staff only). */
export function useModerationStats() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useQuery({
    queryKey: moderationStatsKey(userId ?? ''),
    queryFn: isStaff ? fetchModerationStats : skipToken,
    staleTime: 60 * 1000,
  });
}
