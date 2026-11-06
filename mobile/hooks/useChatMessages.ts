import { type InfiniteData, skipToken, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { invalidateChatLists } from '@/hooks/useChats';
import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import {
  asDeleted,
  type ChatMessage,
  chatKeys,
  type Conversation,
  type Cursor,
  MESSAGE_PAGE_SIZE,
  mergeLatestPage,
  newestServerId,
  olderCursor,
  type ReplyRef,
  upsertMessage,
} from '@/lib/chat';
import { deleteMyChatMessage, fetchMessages, logChatError, markChatRead, sendChatMessage } from '@/lib/chatApi';
import { getChatError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, useOutbox } from '@/stores/chatStore';

type Pages = InfiniteData<ChatMessage[], Cursor | null>;

let localSeq = 0;

/**
 * One conversation's messages, newest first, 30 per page (older pages load on scroll). While
 * `live` (screen focused, app open, chat on) the newest page is fetched every 20 s and merged in,
 * and the chat is marked read whenever a newer message arrives. Sending is optimistic: the
 * message shows at once as "sending", then sent or failed (Retry / Remove).
 */
export function useChatMessages(conversationId: string, live: boolean, pollMs: number | false) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const key = useMemo(() => chatKeys.messages(userId ?? '', conversationId), [userId, conversationId]);
  const outgoing = useOutbox(conversationId);
  const dispatch = useChatStore((s) => s.dispatch);

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: userId && conversationId ? ({ pageParam }) => fetchMessages(conversationId, pageParam) : skipToken,
    initialPageParam: null as Cursor | null,
    getNextPageParam: (lastPage) => olderCursor(lastPage),
    staleTime: 10 * 1000,
  });

  const setPages = useCallback(
    (update: (pages: ChatMessage[][]) => ChatMessage[][]) =>
      queryClient.setQueryData<Pages>(key, (data) => {
        const pages = update(data?.pages ?? []);
        // A restart from the newest page drops the older cursors with it.
        const pageParams = data && pages.length === data.pages.length ? data.pageParams : [null, ...pages.slice(1).map(() => null)];
        return { pages, pageParams: pageParams.slice(0, pages.length) };
      }),
    [queryClient, key],
  );

  /** The newest page only, merged into what is cached (all pages are never refetched by a poll). */
  const pollLatest = useCallback(async () => {
    if (!userId || !conversationId) return;
    try {
      const latest = await fetchMessages(conversationId, null);
      setPages((pages) => mergeLatestPage(pages, latest, MESSAGE_PAGE_SIZE));
    } catch {
      // Logged by code in lib/chatApi.ts; the next poll or focus tries again.
    }
  }, [userId, conversationId, setPages]);

  // Focus and foreground: read again when stale. Then every 20 s while live.
  useRefetchWhenStale({ isStale: query.isStale, refetch: pollLatest }, query.data !== undefined);
  useEffect(() => {
    if (!live || pollMs === false) return;
    const timer = setInterval(() => void pollLatest(), pollMs);
    return () => clearInterval(timer);
  }, [live, pollMs, pollLatest]);

  const server = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  // Read: on open and whenever a newer message arrives while the screen is live.
  const newest = newestServerId(server);
  const markedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !userId || query.data === undefined) return;
    const marker = newest ?? 'empty';
    if (markedFor.current === marker) return;
    markedFor.current = marker;
    markChatRead(conversationId)
      .then(() => {
        queryClient.setQueryData<Conversation[]>(chatKeys.conversations(userId), (list) =>
          list?.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
        );
        void queryClient.invalidateQueries({ queryKey: chatKeys.unread(userId) });
      })
      .catch(() => {
        markedFor.current = null;
      });
  }, [live, newest, userId, conversationId, query.data, queryClient]);

  const attempt = useCallback(
    async (localId: string, body: string, replyTo: ReplyRef | null) => {
      if (!userId) return;
      try {
        const id = await sendChatMessage(conversationId, body, replyTo?.id ?? null);
        // Shown at once with the server id; the next poll replaces it with the stored row.
        setPages((pages) =>
          upsertMessage(pages, {
            id,
            senderId: userId,
            body: body.trim(),
            replyToId: replyTo?.id ?? null,
            replyBody: replyTo?.body ?? null,
            replySenderId: replyTo?.senderId ?? null,
            createdAt: new Date().toISOString(),
            deleted: false,
          }),
        );
        dispatch(conversationId, { type: 'remove', localId });
        invalidateChatLists(queryClient);
        void pollLatest();
      } catch (error) {
        dispatch(conversationId, { type: 'failed', localId, error: getChatError(error, 'message').message });
      }
    },
    [userId, conversationId, setPages, dispatch, queryClient, pollLatest],
  );

  const send = useCallback(
    (body: string, replyTo: ReplyRef | null) => {
      localSeq += 1;
      const localId = `local-${localSeq}`;
      dispatch(conversationId, {
        type: 'add',
        item: { localId, body: body.trim(), replyTo, status: 'sending', error: null, createdAt: Date.now() },
      });
      void attempt(localId, body, replyTo);
    },
    [conversationId, dispatch, attempt],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = useChatStore.getState().outbox[conversationId]?.find((o) => o.localId === localId);
      if (!item || item.status !== 'failed') return;
      dispatch(conversationId, { type: 'retry', localId });
      void attempt(localId, item.body, item.replyTo);
    },
    [conversationId, dispatch, attempt],
  );

  /** Removes a failed message and hands back its text (the screen puts it in an empty composer). */
  const discard = useCallback(
    (localId: string): string | null => {
      const item = useChatStore.getState().outbox[conversationId]?.find((o) => o.localId === localId);
      dispatch(conversationId, { type: 'remove', localId });
      return item?.body ?? null;
    },
    [conversationId, dispatch],
  );

  /** Deletes my own message for both: the text goes at once, a stub stays. Throws on failure. */
  const remove = useCallback(
    async (message: ChatMessage) => {
      await deleteMyChatMessage(message.id);
      setPages((pages) => upsertMessage(pages, asDeleted(message)));
      invalidateChatLists(queryClient);
    },
    [setPages, queryClient],
  );

  const loadOlder = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      query.fetchNextPage().catch((error: unknown) => logChatError('older', error));
    }
  }, [query]);

  return { query, server, outgoing, send, retry, discard, remove, loadOlder, pollLatest };
}
