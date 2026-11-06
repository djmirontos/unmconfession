import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAppActive } from '@/hooks/useAppActive';
import { useChatEnabled } from '@/hooks/useChatEnabled';
import { chatKeys, HEARTBEAT_MS, heartbeatActive } from '@/lib/chat';
import { sendChatHeartbeat } from '@/lib/chatApi';
import { useAuthStore } from '@/stores/authStore';

/**
 * Mounted once at the root. Back in the foreground: the chat switch and the badge counts read
 * again. While chat is on and the app is open: "I'm active" now and about once a minute (the
 * server writes at most every 30 s). Every timer stops in the background or when chat is off.
 */
export function useChatSession(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const appActive = useAppActive();
  const { enabled } = useChatEnabled();

  const wasActive = useRef(appActive);
  useEffect(() => {
    if (appActive && !wasActive.current && userId) {
      void queryClient.invalidateQueries({ queryKey: chatKeys.mode(userId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unread(userId) });
    }
    wasActive.current = appActive;
  }, [appActive, userId, queryClient]);

  const beating = heartbeatActive(enabled, appActive);
  useEffect(() => {
    if (!beating) return;
    // Failures are logged by code only (lib/chatApi.ts); presence is best effort.
    const beat = () => void sendChatHeartbeat().catch(() => undefined);
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [beating]);
}
