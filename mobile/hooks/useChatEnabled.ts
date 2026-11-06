import { skipToken, useQuery } from '@tanstack/react-query';

import { useMembership } from '@/hooks/useProfile';
import { useStaff } from '@/hooks/useStaff';
import { type ChatMode, chatKeys, GATE_STALE_MS, isChatMode, resolveChatAccess } from '@/lib/chat';
import { logChatError } from '@/lib/chatApi';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// The ONLY reader of app_settings.chat_mode (a source-scan test checks it). Members may read the
// column; guests may not, and never ask. Not persisted ('chat' is not in the allowlist), so a cold
// start reads it again; until then chat counts as off.
async function fetchChatMode(): Promise<ChatMode> {
  const { data, error } = await supabase.from('app_settings').select('chat_mode').eq('id', 1).single();
  if (error) {
    logChatError('mode', error);
    throw error;
  }
  return isChatMode(data.chat_mode) ? data.chat_mode : 'off';
}

/**
 * Whether 1:1 chat is on for this viewer: 'on' for every member, 'staff' for staff only, anything
 * else (off, guest, not loaded yet, a failed read) is off. `known` is false while it cannot tell yet
 * (screens wait instead of bouncing). Refetched on app foreground by useChatSession.
 */
export function useChatEnabled(): { enabled: boolean; known: boolean } {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { status } = useMembership();
  const member = status === 'member' && userId !== null;
  const query = useQuery({
    queryKey: chatKeys.mode(userId ?? ''),
    queryFn: member ? fetchChatMode : skipToken,
    staleTime: GATE_STALE_MS,
    retry: 1,
  });
  const mode = query.isError ? null : (query.data ?? null);
  const staff = useStaff(mode === 'staff');
  const enabled = resolveChatAccess({ membership: status, mode, readFailed: query.isError, isStaff: staff.isStaff });
  const known =
    status !== 'loading' && (!member || query.isError || (query.data !== undefined && (mode !== 'staff' || !staff.isLoading)));
  return { enabled, known };
}
