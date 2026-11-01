import { useMutation } from '@tanstack/react-query';

import { logError, logInfo } from '@/lib/log';
import type { ModTarget } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

/** Dismiss every open report on one item in one call (mod_resolve_reports_for 'dismissed'). Returns how many. */
export function useDismissReports() {
  return useMutation({
    mutationKey: ['mod-dismiss'],
    mutationFn: async (target: ModTarget): Promise<number> => {
      const { data, error } = await supabase.rpc('mod_resolve_reports_for', { p_type: target.type, p_id: target.id, p_status: 'dismissed' });
      if (error) {
        logError('rpc.mod_resolve_reports_for', error, { type: target.type });
        throw error;
      }
      logInfo('rpc.mod_resolve_reports_for', 'dismissed', { type: target.type, count: data });
      return data;
    },
  });
}
