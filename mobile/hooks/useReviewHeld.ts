import { useMutation } from '@tanstack/react-query';

import { logError, logInfo } from '@/lib/log';
import { type HeldTarget, type RemovalReason, removalReasonText, type ReviewAction } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

type Input = { target: HeldTarget; action: ReviewAction; reason: RemovalReason | null };

/**
 * Approve or Reject a held item (mod_review). As the web panel: Approve sends no reason; Reject needs
 * one and sends its LABEL as p_reason (the author's notification shows it). The server tells the author.
 */
export function useReviewHeld() {
  return useMutation({
    mutationKey: ['mod-review-held'],
    mutationFn: async ({ target, action, reason }: Input) => {
      const text = action === 'reject' ? removalReasonText(reason) : null;
      if (action === 'reject' && !text) throw new Error('reason_required');
      const { error } = await supabase.rpc('mod_review', {
        p_type: target.type,
        p_id: target.id,
        p_action: action,
        ...(text ? { p_reason: text } : {}),
      });
      if (error) {
        logError('rpc.mod_review', error, { type: target.type, action });
        throw error;
      }
      logInfo('rpc.mod_review', action, { type: target.type });
    },
  });
}
