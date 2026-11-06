import { skipToken, useQuery } from '@tanstack/react-query';

import { fetchHoldReason } from '@/lib/holdNotice';
import { HOLD_REASON_STALE_MS, type HoldReason, type HoldTarget, holdReasonKey } from '@/lib/holdReason';
import { useAuthStore } from '@/stores/authStore';

/**
 * Why the member's OWN pending item is held. `ownPending` must be true only for the viewer's own
 * pending row (My Posts, their own pending comment); otherwise nothing is asked. Rendered rows only.
 */
export function useHoldReason(type: HoldTarget, id: string, ownPending: boolean): HoldReason | null {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useQuery({
    queryKey: holdReasonKey(userId ?? '', type, id),
    queryFn: ownPending && userId ? () => fetchHoldReason(type, id) : skipToken,
    staleTime: HOLD_REASON_STALE_MS,
    retry: 1,
  });
  return ownPending ? (query.data ?? null) : null;
}
