import { skipToken, useQuery } from '@tanstack/react-query';

import { useMembership } from '@/hooks/useProfile';
import { logError } from '@/lib/log';
import { staffState } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'staff': not persisted (not in the queryClient allowlist), cleared on sign-out (clearMemberCaches).
export const staffKey = (userId: string) => ['staff', userId] as const;

async function fetchIsStaff(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_staff');
  if (error) {
    logError('rpc.is_staff', error);
    throw error;
  }
  return data === true;
}

/**
 * Whether the signed-in member is an active moderator or admin (is_staff()). Fails closed: guests,
 * loading and any error read as "not staff". Hiding staff UI is cosmetic; every mod_* RPC checks again.
 * `ask` false skips the call (the chat gate asks only while chat is in staff mode).
 */
export function useStaff(ask = true): { isStaff: boolean; isLoading: boolean } {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const restored = useAuthStore((s) => s.restored);
  const { status } = useMembership();
  const enabled = ask && status === 'member' && !!userId;
  const query = useQuery({
    queryKey: staffKey(userId ?? ''),
    queryFn: enabled ? fetchIsStaff : skipToken,
    staleTime: 5 * 60 * 1000,
  });
  return staffState({ restored, membership: status, hasUser: !!userId, isPending: query.isPending, isError: query.isError, data: query.data });
}
