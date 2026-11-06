import { getErrorCode } from '@/lib/errors';
import { type HoldReason, type HoldTarget, holdNoticeText, holdReasonKey, isHoldReason, shouldUpgradeToast } from '@/lib/holdReason';
import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * get_my_hold_reason for one of the signed-in member's OWN items. Callers pass only ids of items they
 * just created or edited, or their own pending rows. Logged by error code only.
 */
export async function fetchHoldReason(type: HoldTarget, id: string): Promise<HoldReason | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.rpc('get_my_hold_reason', { p_type: type, p_id: id });
  if (error) {
    logError('holdReason', { code: getErrorCode(error) ?? 'unknown' });
    throw error;
  }
  return isHoldReason(data) ? data : null;
}

/**
 * After a submit or edit came back pending: shows today's text at once, then, if the server says the
 * word filter held it and answers within 2 s, swaps in the keyword line. Never blocks, never errors.
 */
export function announceHold(type: HoldTarget, id: string, fallback: string): void {
  const show = useToastStore.getState().show;
  show(fallback);
  const shownId = useToastStore.getState().id;
  const userId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId) return;
  const started = Date.now();
  fetchHoldReason(type, id)
    .then((reason) => {
      // Cached for the pending box and badge, so they do not ask again.
      queryClient.setQueryData(holdReasonKey(userId, type, id), reason);
      const toast = useToastStore.getState();
      const stillShowing = toast.id === shownId && toast.message === fallback;
      if (shouldUpgradeToast({ reason, elapsedMs: Date.now() - started, stillShowing })) show(holdNoticeText(reason, fallback));
    })
    .catch(() => undefined);
}
