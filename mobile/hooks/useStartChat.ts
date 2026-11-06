import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { type ChatRequest, chatKeys, type Conversation, existingChatAction } from '@/lib/chat';
import { fetchChatRequests, fetchConversations } from '@/lib/chatApi';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

export type ChatTarget = { id: string; nickname: string; avatarKey: string | null };

/**
 * "Message" on a member's profile. An existing chat opens; a request already sent says so; their
 * request to you opens Requests; otherwise the request sheet opens (`target`). If the lists cannot
 * be read, the sheet opens anyway and the server answers (already chatting, pending, incoming).
 */
export function useStartChat() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const requireAuth = useRequireAuth();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const showToast = useToastStore((s) => s.show);
  const [target, setTarget] = useState<ChatTarget | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const start = useCallback(
    async (member: ChatTarget) => {
      if (!requireAuth('default') || !userId || busy.current) return;
      busy.current = true;
      setChecking(true);
      try {
        const [conversations, requests] = await Promise.all([
          queryClient.fetchQuery<Conversation[]>({ queryKey: chatKeys.conversations(userId), queryFn: fetchConversations, staleTime: 5 * 1000 }),
          queryClient.fetchQuery<ChatRequest[]>({ queryKey: chatKeys.requests(userId), queryFn: fetchChatRequests, staleTime: 5 * 1000 }),
        ]);
        const next = existingChatAction(conversations, requests, member.id);
        if (next.kind === 'open') router.push({ pathname: '/chat/[id]', params: { id: next.conversationId } });
        else if (next.kind === 'pending') showToast('Request sent, waiting for a reply');
        else if (next.kind === 'incoming') router.push('/chat/requests');
        else setTarget(member);
      } catch {
        setTarget(member);
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [requireAuth, userId, queryClient, router, showToast],
  );

  return { start, checking, target, close: useCallback(() => setTarget(null), []) };
}
