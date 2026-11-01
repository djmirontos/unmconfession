import { skipToken, useQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { type RecentSignup, toRecentSignups } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-recent-signups': not persisted, cleared on sign-out (clearMemberCaches).
export const recentSignupsKey = (userId: string) => ['mod-recent-signups', userId] as const;

const LIMIT = 10;

async function fetchRecentSignups(): Promise<RecentSignup[]> {
  const { data, error } = await supabase.rpc('mod_recent_signups', { p_limit: LIMIT });
  if (error) {
    logError('rpc.mod_recent_signups', error);
    throw error;
  }
  return toRecentSignups(data);
}

/** The newest members, nickname and date only (staff only). */
export function useRecentSignups() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useQuery({
    queryKey: recentSignupsKey(userId ?? ''),
    queryFn: isStaff ? fetchRecentSignups : skipToken,
    staleTime: 60 * 1000,
  });
}
