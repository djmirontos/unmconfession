import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { type ChatRequest, chatKeys, type Conversation, existingChatAction, startRoute } from '@/lib/chat';
import { fetchChatRequests, fetchConversations } from '@/lib/chatApi';
import { useAuthStore } from '@/stores/authStore';

/**
 * "Message" on a member's profile: always a chat page. An existing chat (or my request still
 * waiting) opens; their request to me opens Requests; otherwise the new chat page, where the first
 * message is the request. The two list reads are the same as before (cached for 5 s). If they
 * fail, the new chat page opens anyway and the server answers on send.
 */
export function useStartChat() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const requireAuth = useRequireAuth();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const start = useCallback(
    async (memberId: string) => {
      if (!requireAuth('default') || !userId || busy.current) return;
      busy.current = true;
      setChecking(true);
      let route: ReturnType<typeof startRoute> = { kind: 'new', memberId };
      try {
        const [conversations, requests] = await Promise.all([
          queryClient.fetchQuery<Conversation[]>({ queryKey: chatKeys.conversations(userId), queryFn: fetchConversations, staleTime: 5 * 1000 }),
          queryClient.fetchQuery<ChatRequest[]>({ queryKey: chatKeys.requests(userId), queryFn: fetchChatRequests, staleTime: 5 * 1000 }),
        ]);
        route = startRoute(existingChatAction(conversations, requests, memberId), memberId);
      } catch {
        // The lists could not be read: the new chat page, the server decides on send.
      } finally {
        busy.current = false;
        setChecking(false);
      }
      if (route.kind === 'chat') router.push({ pathname: '/chat/[id]', params: { id: route.conversationId } });
      else if (route.kind === 'requests') router.push('/chat/requests');
      else router.push({ pathname: '/chat/new', params: { with: route.memberId } });
    },
    [requireAuth, userId, queryClient, router],
  );

  return { start, checking };
}
