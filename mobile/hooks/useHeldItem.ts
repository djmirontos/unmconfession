import { skipToken, useQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { getErrorCode } from '@/lib/errors';
import { logError } from '@/lib/log';
import { type HeldTarget, type Hold, type ModContent, toHeldContent } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-held-item': not persisted, cleared on sign-out (clearMemberCaches).
export const heldItemKey = (userId: string, type: string, id: string) => ['mod-held-item', userId, type, id] as const;

/** null: the item no longer exists. */
export type HeldDetail = { content: ModContent; hold: Hold } | null;

async function fetchHeldItem(target: HeldTarget): Promise<HeldDetail> {
  const { data, error } = await supabase.rpc('mod_get_content', { p_type: target.type, p_id: target.id });
  if (error) {
    if (getErrorCode(error) === 'not_found') return null;
    logError('rpc.mod_get_content', error, { type: target.type });
    throw error;
  }
  return toHeldContent(target, data);
}

/** One held item in full, with its hold record (staff only). */
export function useHeldItem(target: HeldTarget | null) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useQuery({
    queryKey: heldItemKey(userId ?? '', target?.type ?? '', target?.id ?? ''),
    queryFn: isStaff && target ? () => fetchHeldItem(target) : skipToken,
    staleTime: 30 * 1000,
  });
}
