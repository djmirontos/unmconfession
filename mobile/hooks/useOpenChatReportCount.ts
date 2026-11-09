import { skipToken, useQuery } from '@tanstack/react-query';

import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { useStaff } from '@/hooks/useStaff';
import { logChatError } from '@/lib/chatApi';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-chat-reports-open': not persisted, cleared on sign-out (clearMemberCaches).
export const openChatReportCountKey = (userId: string) => ['mod-chat-reports-open', userId] as const;

async function fetchOpenChatReportCount(): Promise<number> {
  const { data, error } = await supabase.rpc('mod_open_chat_report_count');
  if (error) {
    logChatError('openReportCount', error);
    throw error;
  }
  return data;
}

/**
 * Open chat reports not about me (staff only), for the hub card. Only a count: chat reports are
 * reviewed in the admin web panel. Non-staff never call it. Refetched on focus once stale.
 */
export function useOpenChatReportCount() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  const query = useQuery({
    queryKey: openChatReportCountKey(userId ?? ''),
    queryFn: isStaff ? fetchOpenChatReportCount : skipToken,
    staleTime: 60 * 1000,
    retry: 1,
  });
  useRefetchWhenStale(query, isStaff);
  return query;
}
