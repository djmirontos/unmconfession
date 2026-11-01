import { skipToken, useQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { type HeldCounts, toHeldCounts } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-dashboard': not persisted, cleared on sign-out (clearMemberCaches). Hub only, never on Home.
export const moderationCountsKey = (userId: string) => ['mod-dashboard', userId] as const;

async function fetchHeldCounts(): Promise<HeldCounts> {
  const { data, error } = await supabase.rpc('mod_dashboard');
  if (error) {
    logError('rpc.mod_dashboard', error);
    throw error;
  }
  const counts = toHeldCounts(data);
  if (!counts) throw new Error('mod_dashboard returned no usable row');
  return counts;
}

/** Held (pending) posts, comments and listings, from mod_dashboard (staff only). */
export function useModerationCounts() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useQuery({
    queryKey: moderationCountsKey(userId ?? ''),
    queryFn: isStaff ? fetchHeldCounts : skipToken,
    staleTime: 60 * 1000,
  });
}
