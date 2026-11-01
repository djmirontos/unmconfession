import { useMutation } from '@tanstack/react-query';

import { logError, logInfo } from '@/lib/log';
import { type ModTarget, type RemovalReason, removalReasonText } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

/**
 * Remove a published post, comment or listing (mod_review 'remove'). The server closes the open
 * reports and notifies the author itself, so nothing else is called. Never for a profile.
 */
export function useRemoveContent() {
  return useMutation({
    mutationKey: ['mod-remove'],
    mutationFn: async ({ target, reason }: { target: ModTarget; reason: RemovalReason | null }) => {
      if (target.type === 'profile') throw new Error('invalid_action');
      // Same p_reason as the web panel: the reason's label.
      const text = removalReasonText(reason);
      if (!text) throw new Error('reason_required');
      const { error } = await supabase.rpc('mod_review', { p_type: target.type, p_id: target.id, p_action: 'remove', p_reason: text });
      if (error) {
        logError('rpc.mod_review', error, { type: target.type });
        throw error;
      }
      logInfo('rpc.mod_review', 'removed', { type: target.type });
    },
  });
}
