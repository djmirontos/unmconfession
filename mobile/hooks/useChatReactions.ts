import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { chatKeys } from '@/lib/chat';
import { fetchMessageReactions, reactToChatMessage } from '@/lib/chatApi';
import {
  idsKey,
  keepPending,
  mergeReactions,
  nextReaction,
  type ReactionKey,
  type ReactionsMap,
  reactionsFromRows,
  setMyReaction,
} from '@/lib/chatReactions';
import { getChatError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

// After the loaded ids change (open, older page, a new message), wait this long so several
// changes make one call.
const DEBOUNCE_MS = 150;

/**
 * Reactions for the loaded messages of one accepted chat, in one cache entry per chat
 * (chatKeys.reactions). Fetched with get_message_reactions (one call per 100 ids) only when the
 * loaded ids change (debounced) and once per message poll while the screen is live; never per
 * bubble. A refresh keeps the objects of unchanged messages, so only a changed bubble re-renders.
 * Setting a reaction is optimistic and rolled back with a toast on failure.
 */
export function useChatReactions(conversationId: string, messageIds: readonly string[], pollMs: number | false) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? '');
  const key = useMemo(() => chatKeys.reactions(userId, conversationId), [userId, conversationId]);
  // Read-only subscription: this hook decides when to fetch.
  const query = useQuery<ReactionsMap>({ queryKey: key, queryFn: skipToken });

  const ids = useRef<readonly string[]>(messageIds);
  const pending = useRef(new Set<string>());
  const loadedIds = idsKey(messageIds);
  useEffect(() => {
    ids.current = messageIds;
  }, [messageIds]);

  const refresh = useCallback(async () => {
    const list = ids.current;
    if (!conversationId || !userId || list.length === 0) return;
    try {
      const rows = await fetchMessageReactions(conversationId, list);
      queryClient.setQueryData<ReactionsMap>(key, (prev) => mergeReactions(prev, keepPending(prev, reactionsFromRows(rows), pending.current)));
    } catch {
      // Logged by code in lib/chatApi.ts; the next change or poll tries again.
    }
  }, [conversationId, userId, queryClient, key]);

  // The loaded ids changed: one call for all of them, a moment later.
  useEffect(() => {
    if (!conversationId || loadedIds === '') return;
    const timer = setTimeout(() => void refresh(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [conversationId, loadedIds, refresh]);

  // With the message poll: once per tick, only while the screen is focused and the app open.
  useEffect(() => {
    if (pollMs === false || !conversationId) return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, conversationId, refresh]);

  /** Sets (or with null removes) my reaction. One change per message at a time. */
  const react = useCallback(
    (messageId: string, reaction: ReactionKey | null) => {
      if (pending.current.has(messageId)) return;
      const before = queryClient.getQueryData<ReactionsMap>(key)?.[messageId]?.mine ?? null;
      if (before === reaction) return;
      pending.current.add(messageId);
      queryClient.setQueryData<ReactionsMap>(key, (prev) => setMyReaction(prev, messageId, reaction));
      reactToChatMessage(messageId, reaction)
        .catch((error: unknown) => {
          queryClient.setQueryData<ReactionsMap>(key, (prev) => setMyReaction(prev, messageId, before));
          useToastStore.getState().show(getChatError(error, 'react').message);
        })
        .finally(() => pending.current.delete(messageId));
    },
    [queryClient, key],
  );

  /** A tap on a reaction (bar or badge): mine again removes it, another one replaces it. */
  const toggle = useCallback(
    (messageId: string, tapped: ReactionKey) => {
      const current = queryClient.getQueryData<ReactionsMap>(key)?.[messageId]?.mine ?? null;
      react(messageId, nextReaction(current, tapped));
    },
    [queryClient, key, react],
  );

  return { reactions: query.data, toggle };
}
