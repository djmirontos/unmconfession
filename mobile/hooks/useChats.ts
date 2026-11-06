import { type QueryClient, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useChatEnabled } from '@/hooks/useChatEnabled';
import { chatKeys, LIST_POLL_MS } from '@/lib/chat';
import {
  type ChatSettings,
  fetchChatRequests,
  fetchChatSettings,
  fetchChatUnread,
  fetchConversations,
  setChatSettings,
  type WhoCanMessage,
} from '@/lib/chatApi';
import { useAuthStore } from '@/stores/authStore';

// Chat lists. Every key is chatKeys.* (the 'chat' root plus the user id): never persisted, cleared
// on logout (clearMemberCaches) and account deletion (forgetDeletedAccount).

const useUserId = () => useAuthStore((s) => s.session?.user.id ?? null);

/** After anything that changes the lists (accept, decline, send, block, mute, delete). */
export function invalidateChatLists(queryClient: QueryClient): void {
  for (const part of ['conversations', 'requests', 'unread']) {
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'chat' && q.queryKey[2] === part });
  }
}

/** `poll`: refetch every 30 s (only while the Chats list is focused and the app is open). */
export function useConversations(poll = false) {
  const userId = useUserId();
  const { enabled } = useChatEnabled();
  return useQuery({
    queryKey: chatKeys.conversations(userId ?? ''),
    queryFn: enabled && userId ? fetchConversations : skipToken,
    staleTime: 15 * 1000,
    refetchInterval: poll ? LIST_POLL_MS : false,
  });
}

export function useChatRequests(poll = false) {
  const userId = useUserId();
  const { enabled } = useChatEnabled();
  return useQuery({
    queryKey: chatKeys.requests(userId ?? ''),
    queryFn: enabled && userId ? fetchChatRequests : skipToken,
    staleTime: 15 * 1000,
    refetchInterval: poll ? LIST_POLL_MS : false,
  });
}

/** The Chats tab badge counts (refetched on foreground and whenever the lists change). */
export function useChatUnread(poll = false) {
  const userId = useUserId();
  const { enabled } = useChatEnabled();
  return useQuery({
    queryKey: chatKeys.unread(userId ?? ''),
    queryFn: enabled && userId ? fetchChatUnread : skipToken,
    staleTime: 15 * 1000,
    refetchInterval: poll ? LIST_POLL_MS : false,
  });
}

export function useChatSettings() {
  const userId = useUserId();
  const { enabled } = useChatEnabled();
  return useQuery({
    queryKey: chatKeys.settings(userId ?? ''),
    queryFn: enabled && userId ? fetchChatSettings : skipToken,
    staleTime: 60 * 1000,
  });
}

/** Optimistic: the switch moves at once and goes back if the save fails (the error is rethrown). */
export function useSetChatSettings() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useCallback(
    async (change: { who?: WhoCanMessage; showOnline?: boolean }) => {
      if (!userId) return;
      const key = chatKeys.settings(userId);
      const previous = queryClient.getQueryData<ChatSettings>(key);
      if (previous) {
        queryClient.setQueryData<ChatSettings>(key, {
          whoCanMessage: change.who ?? previous.whoCanMessage,
          showOnline: change.showOnline ?? previous.showOnline,
        });
      }
      try {
        await setChatSettings(change);
      } catch (error) {
        if (previous) queryClient.setQueryData(key, previous);
        throw error;
      } finally {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient, userId],
  );
}
