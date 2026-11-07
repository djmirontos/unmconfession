import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { invalidateChatLists } from '@/hooks/useChats';
import {
  afterRequestFailure,
  type ChatErrorAction,
  chatKeys,
  type Conversation,
  firstMessageRoute,
  pendingConversation,
  withConversation,
} from '@/lib/chat';
import { fetchConversations, reopenMyChat, sendChatRequest } from '@/lib/chatApi';
import { getChatError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';

export type FirstMessageTarget = { id: string; nickname: string; avatarKey: string | null };
export type FirstMessageError = { message: string; action: ChatErrorAction };

/**
 * The first message on a new chat page: send_chat_request (the request, at most 200 characters).
 * On success the page becomes /chat/<id> (route replaced, no second history entry) and shows the
 * request as pending at once (the list row is put in the cache; the usual refresh follows).
 * already_chatting (a chat I deleted for myself): reopen_my_chat once, keep the text as that
 * chat's draft and open it. request_pending: open the pending chat. Anything else stays on the
 * page as an inline error with the text kept.
 */
export function useFirstMessage(target: FirstMessageTarget | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const myId = useAuthStore((s) => s.session?.user.id ?? null);
  const showToast = useToastStore((s) => s.show);
  const [error, setError] = useState<FirstMessageError | null>(null);

  const openChat = useCallback(
    (conversationId: string) => router.replace(firstMessageRoute(conversationId)),
    [router],
  );

  const failed = useCallback(
    (e: unknown): false => {
      const failure = getChatError(e, 'request');
      if (failure.action === 'disabled') {
        // The chat switch was turned off: the guard sends the page Home.
        showToast(failure.message);
        return false;
      }
      setError({ message: failure.message, action: failure.action });
      return false;
    },
    [showToast],
  );

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      if (!target || !myId) return false;
      setError(null);
      try {
        const conversationId = await sendChatRequest(target.id, text);
        queryClient.setQueryData<Conversation[]>(chatKeys.conversations(myId), (list) =>
          withConversation(list, pendingConversation({ conversationId, other: target, body: text, myId, sentAt: new Date().toISOString() })),
        );
        invalidateChatLists(queryClient);
        openChat(conversationId);
        return true;
      } catch (e) {
        const code = getChatError(e, 'request').code;
        if (afterRequestFailure(code, false) === 'reopen') {
          try {
            const conversationId = await reopenMyChat(target.id);
            // Nothing is sent: what was typed waits in that chat's composer.
            useChatStore.getState().setDraft(conversationId, { text, replyTo: null });
            invalidateChatLists(queryClient);
            openChat(conversationId);
            return true;
          } catch (reopenError) {
            invalidateChatLists(queryClient);
            return failed(reopenError);
          }
        }
        if (code === 'request_pending') {
          // My request is already waiting (the list was out of date): open it.
          const list = await queryClient
            .fetchQuery({ queryKey: chatKeys.conversations(myId), queryFn: fetchConversations, staleTime: 0 })
            .catch(() => undefined);
          const pending = list?.find((c) => c.otherId === target.id);
          if (pending) {
            openChat(pending.id);
            return false;
          }
        }
        return failed(e);
      }
    },
    [target, myId, queryClient, openChat, failed],
  );

  return { send, error, clearError: useCallback(() => setError(null), []) };
}
