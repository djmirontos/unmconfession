import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Clipboard, KeyboardAvoidingView, type ListRenderItemInfo, Platform, Pressable, Text, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatHeader, type ChatHeaderMember } from '@/components/chat/ChatHeader';
import { ChatReportSheet } from '@/components/chat/ChatReportSheet';
import { MessageActionsOverlay } from '@/components/chat/MessageActionsOverlay';
import { DayLine, MessageBubble, type MessageRow } from '@/components/chat/MessageBubble';
import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppActive } from '@/hooks/useAppActive';
import { useBlockUser } from '@/hooks/useBlockUser';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useChatReactions } from '@/hooks/useChatReactions';
import { invalidateChatLists, useConversations } from '@/hooks/useChats';
import { useChatScreenGuard } from '@/hooks/useChatScreenGuard';
import { useTheme } from '@/hooks/useTheme';
import {
  buildChatRows,
  type ChatRow,
  chatKeys,
  chatPageState,
  type Conversation,
  leaveQuietly,
  MESSAGE_COUNTER_FROM,
  MESSAGE_MAX,
  PENDING_COMPOSER_REASON,
  pendingBanner,
  pendingRows,
  pollInterval,
  type ReplyRef,
  replyPreview,
} from '@/lib/chat';
import { closeMyChat, deleteChatForMe, setChatMuted } from '@/lib/chatApi';
import { type ReactionKey, reactableIds } from '@/lib/chatReactions';
import { canReportMessage, CHAT_CLOSED, CLOSE_HELP, type ChatReportTarget } from '@/lib/chatReports';
import { getChatError } from '@/lib/errors';
import { isValidUserId as isUuid } from '@/lib/profileView';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';

const keyExtractor = (row: ChatRow) => row.key;
const NOOP = () => undefined;

/** The request I sent, waiting for an answer: what was sent, read-only. */
function WaitingBanner({ nickname }: { nickname: string }) {
  const { colors } = useTheme();
  return (
    <View className="mx-3 mt-3 flex-row items-start gap-2 rounded-2xl bg-surface2 px-4 py-3" accessibilityRole="summary">
      <Ionicons name="time-outline" size={18} color={colors.chatAccent} />
      <Text className="flex-1 text-sm text-text">{pendingBanner(nickname)}</Text>
    </View>
  );
}

function MessagesSkeleton() {
  return (
    <View className="flex-1 justify-end gap-3 p-4" accessibilityLabel="Loading messages" accessibilityRole="progressbar">
      <Skeleton width="55%" height={40} className="rounded-2xl" />
      <View className="items-end">
        <Skeleton width="45%" height={40} className="rounded-2xl" />
      </View>
      <Skeleton width="65%" height={56} className="rounded-2xl" />
    </View>
  );
}

/**
 * A 1:1 chat: newest at the bottom, swipe right to reply, long press for options. A request I sent
 * that is still waiting shows read-only (the request as my bubble, a banner, a disabled composer)
 * and turns into the normal chat when they accept, without leaving the page.
 */
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const block = useBlockUser();
  const ready = useChatScreenGuard();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const routeId = isUuid(rawId) ? rawId.toLowerCase() : '';
  const conversationId = ready ? routeId : '';
  const myId = useAuthStore((s) => s.session?.user.id ?? '');
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const pollMs = pollInterval('messages', { focused: isFocused, appActive, enabled: ready });

  // Two views of the same cached list (one request): the second polls (the list's usual 30 s) only
  // while my request is waiting here, so an accept turns the page into the chat without leaving it.
  const conversation = useConversations(false).data?.find((c) => c.id === conversationId) ?? null;
  const conversations = useConversations(conversation?.status === 'pending_sent' && pollMs !== false);
  const state = ready ? chatPageState({ routeValid: routeId !== '', listLoaded: conversations.data !== undefined, listFetching: conversations.isFetching, conversation }) : 'loading';
  const accepted = state === 'accepted';
  // get_messages only for an accepted chat; a waiting request shows what the list already has.
  const chat = useChatMessages(accepted ? conversationId : '', pollMs !== false && accepted, pollMs);
  const nickname = conversation?.otherNickname ?? '';

  // A chat that was on screen and then left the list (declined, blocked, deleted): back to the list.
  const seen = useRef(false);
  useEffect(() => {
    if (conversation) seen.current = true;
    if (leaveQuietly(seen.current, state)) router.replace('/(tabs)/chats');
  }, [conversation, state, router]);

  // The reply target lives here (it rarely changes); the text lives in the composer only.
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(() => useChatStore.getState().drafts[routeId]?.replyTo ?? null);
  useEffect(() => {
    if (routeId) useChatStore.getState().patchDraft(routeId, { replyTo });
  }, [routeId, replyTo]);
  const [focusSignal, setFocusSignal] = useState(0);
  const [restore, setRestore] = useState<{ text: string; n: number } | null>(null);

  const [now] = useState(() => Date.now());
  const rows = useMemo(() => buildChatRows(chat.server, chat.outgoing, myId, now), [chat.server, chat.outgoing, myId, now]);
  const waitingRows = useMemo(() => (conversation && state === 'pending' ? pendingRows(conversation, myId, now) : []), [conversation, state, myId, now]);

  const startReply = useCallback((row: MessageRow) => {
    if (!row.id) return;
    setReplyTo({ id: row.id, body: row.deleted ? null : row.body, senderId: row.senderId });
    setFocusSignal((n) => n + 1);
  }, []);

  const chatSend = chat.send;
  const onSend = useCallback(
    (text: string) => {
      chatSend(text, replyTo);
      setReplyTo(null);
      return true;
    },
    [chatSend, replyTo],
  );
  const cancelReply = useCallback(() => setReplyTo(null), []);

  // Long press: Reply, Copy, Delete (mine only). A failed message: Retry or Remove.
  // Long press: the row and where the finger was (the overlay mounts only while this is set).
  const [menuFor, setMenuForState] = useState<{ row: MessageRow; y: number | null } | null>(null);
  const openMessageMenu = useCallback((row: MessageRow, y: number | null) => setMenuForState({ row, y }), []);
  const closeMenu = useCallback(() => setMenuForState(null), []);
  const [failedFor, setFailedFor] = useState<MessageRow | null>(null);
  const [chatMenu, setChatMenu] = useState(false);

  const { remove, retry, discard } = chat;
  const server = chat.server;

  // Reactions: one get_message_reactions call for the loaded ids (when they change) and one per
  // message poll while live; each bubble gets only its own entry.
  const loadedIds = useMemo(() => (accepted ? reactableIds(server) : []), [accepted, server]);
  const { reactions, toggle } = useChatReactions(accepted ? conversationId : '', loadedIds, accepted ? pollMs : false);
  const reactTo = useCallback((row: MessageRow, key: ReactionKey) => {
    if (row.id) toggle(row.id, key);
  }, [toggle]);
  const confirmDelete = useCallback(
    (row: MessageRow) => {
      const message = server.find((m) => m.id === row.id);
      if (!message) return;
      Alert.alert('Delete this message?', 'It will be removed for both of you.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void remove(message).catch((error: unknown) => showToast(getChatError(error, 'message').message)),
        },
      ]);
    },
    [server, remove, showToast],
  );

  // The report sheet mounts only while this is set (one report_chat call on Send, nothing before).
  const [reportFor, setReportFor] = useState<ChatReportTarget | null>(null);
  const closeReport = useCallback(() => setReportFor(null), []);

  const messageActions = useMemo<SheetAction[]>(() => {
    if (!menuFor) return [];
    const row = menuFor.row;
    const body = row.body;
    const live = row.id !== null && !row.deleted;
    const reply: SheetAction = { label: 'Reply', icon: 'arrow-undo-outline', onPress: () => startReply(row) };
    const copy: SheetAction | null = body
      ? {
          label: 'Copy',
          icon: 'copy-outline',
          onPress: () => {
            Clipboard.setString(body);
            showToast('Copied');
          },
        }
      : null;
    const del: SheetAction = { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(row) };
    // Their messages only (never mine, a deleted one or the waiting request).
    const report: SheetAction | null =
      conversation && row.id && canReportMessage(row)
        ? {
            label: 'Report message',
            icon: 'flag-outline',
            destructive: true,
            onPress: () =>
              setReportFor({
                conversationId: conversation.id,
                messageId: row.id,
                other: { id: conversation.otherId, nickname: conversation.otherNickname },
                source: 'chat',
              }),
          }
        : null;
    return [live ? reply : null, copy, live && row.mine ? del : null, report].filter((a): a is SheetAction => a !== null);
  }, [menuFor, startReply, confirmDelete, showToast, conversation]);

  const failedActions = useMemo<SheetAction[]>(() => {
    const localId = failedFor?.localId;
    if (!localId) return [];
    return [
      { label: 'Retry', icon: 'refresh', onPress: () => retry(localId) },
      {
        label: 'Remove',
        icon: 'trash-outline',
        destructive: true,
        // The text is never lost: it goes back into an empty composer.
        onPress: () => {
          const body = discard(localId);
          if (body) setRestore((r) => ({ text: body, n: (r?.n ?? 0) + 1 }));
        },
      },
    ];
  }, [failedFor, retry, discard]);

  const leave = useCallback(() => {
    queryClient.removeQueries({ queryKey: chatKeys.messages(myId, conversationId) });
    invalidateChatLists(queryClient);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/chats');
  }, [queryClient, myId, conversationId, router]);

  const chatActions = useMemo<SheetAction[]>(() => {
    if (!conversation) return [];
    const c = conversation;
    return [
      {
        label: c.muted ? 'Unmute' : 'Mute',
        icon: c.muted ? 'notifications-outline' : 'notifications-off-outline',
        onPress: () => {
          setChatMuted(c.id, !c.muted)
            .then(() => {
              queryClient.setQueryData<Conversation[]>(chatKeys.conversations(myId), (list) =>
                list?.map((x) => (x.id === c.id ? { ...x, muted: !c.muted } : x)),
              );
              invalidateChatLists(queryClient);
              showToast(c.muted ? 'Chat unmuted' : 'Chat muted');
            })
            .catch((error: unknown) => showToast(getChatError(error, 'chat').message));
        },
      },
      {
        label: 'Delete chat',
        icon: 'trash-outline',
        destructive: true,
        onPress: () =>
          Alert.alert(
            'Delete this chat?',
            "It's removed from your chat list and your copy of the messages is cleared. They aren't told. You can message them again later from their profile.",
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () =>
                  void deleteChatForMe(c.id)
                    .then(() => {
                      showToast('Chat deleted');
                      leave();
                    })
                    .catch((error: unknown) => showToast(getChatError(error, 'chat').message)),
              },
            ],
          ),
      },
      {
        label: 'Report chat',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => setReportFor({ conversationId: c.id, messageId: null, other: { id: c.otherId, nickname: c.otherNickname }, source: 'chat' }),
      },
      {
        label: 'Close chat',
        icon: 'close-circle-outline',
        destructive: true,
        onPress: () =>
          Alert.alert('Close this chat?', CLOSE_HELP, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Close chat',
              style: 'destructive',
              onPress: () =>
                void closeMyChat(c.id)
                  .then(() => {
                    showToast(CHAT_CLOSED);
                    leave();
                  })
                  .catch((error: unknown) => showToast(getChatError(error, 'close').message)),
            },
          ]),
      },
      {
        label: 'Block',
        icon: 'ban-outline',
        destructive: true,
        onPress: () => block({ id: c.otherId, nickname: c.otherNickname }, leave),
      },
    ];
  }, [conversation, queryClient, myId, showToast, leave, block]);

  // The waiting request: the same bubble, no reply, no menu (it has no message id yet).
  const renderWaiting = useCallback(
    ({ item }: ListRenderItemInfo<ChatRow>) =>
      item.kind === 'day' ? (
        <DayLine label={item.label} />
      ) : (
        <MessageBubble row={item} myId={myId} otherNickname={nickname} onReply={NOOP} onMenu={NOOP} onFailedPress={NOOP} />
      ),
    [myId, nickname],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatRow>) =>
      item.kind === 'day' ? (
        <DayLine label={item.label} />
      ) : (
        <MessageBubble
          row={item}
          myId={myId}
          otherNickname={nickname}
          onReply={startReply}
          onMenu={openMessageMenu}
          onFailedPress={setFailedFor}
          reactions={item.id ? reactions?.[item.id] : undefined}
          onReact={reactTo}
        />
      ),
    [myId, nickname, startReply, openMessageMenu, reactions, reactTo],
  );

  const { query, loadOlder } = chat;
  let body;
  if (state === 'missing') {
    body = (
      <View className="gap-4 p-4">
        <EmptyState icon="chatbubbles-outline" title="This chat isn't available" />
        <Button label="Back to Chats" variant="secondary" onPress={() => router.replace('/(tabs)/chats')} />
      </View>
    );
  } else if (!conversation && conversations.isError) {
    body = <ErrorState message={getChatError(conversations.error, 'chat').message} onRetry={() => void conversations.refetch()} />;
  } else if (conversation && state === 'pending') {
    body = (
      <View className="flex-1">
        <WaitingBanner nickname={nickname} />
        <FlatList data={waitingRows} renderItem={renderWaiting} keyExtractor={keyExtractor} inverted contentContainerStyle={{ paddingVertical: 8 }} />
      </View>
    );
  } else if (!conversation || (!query.data && !query.isError)) {
    body = <MessagesSkeleton />;
  } else if (!query.data) {
    body = <ErrorState message={getChatError(query.error, 'chat').message} onRetry={() => void query.refetch()} />;
  } else {
    body = (
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        inverted
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 8 }}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <Text className="py-4 text-center text-sm text-text-dim">Loading older messages…</Text>
          ) : query.isFetchNextPageError ? (
            <Pressable onPress={loadOlder} accessibilityRole="button" className="min-h-11 items-center justify-center">
              <Text className="text-sm font-bold text-text-dim">Couldn&apos;t load older messages. Tap to retry</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="No messages yet" message="Say hello." />}
      />
    );
  }

  const replying = useMemo(
    () => (replyTo ? replyPreview({ replyToId: replyTo.id, replyBody: replyTo.body, replySenderId: replyTo.senderId }, myId, nickname) : null),
    [replyTo, myId, nickname],
  );
  const member = useMemo<ChatHeaderMember | null>(
    () =>
      conversation
        ? { id: conversation.otherId, nickname: conversation.otherNickname, avatarKey: conversation.otherAvatarKey, online: conversation.isOnline === true }
        : null,
    [conversation],
  );
  const openMenu = useCallback(() => setChatMenu(true), []);

  return (
    <View className="flex-1 bg-chat-bg" style={{ paddingTop: insets.top }}>
      <ChatHeader member={member} onMenu={accepted ? openMenu : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1">{body}</View>
        {conversation && (state === 'pending' || state === 'accepted') ? (
          <ChatComposer
            draftKey={routeId}
            onSend={onSend}
            replying={replying}
            onCancelReply={cancelReply}
            max={MESSAGE_MAX}
            counterFrom={MESSAGE_COUNTER_FROM + 1}
            disabledReason={state === 'pending' ? PENDING_COMPOSER_REASON : null}
            focusSignal={focusSignal}
            restore={restore}
          />
        ) : null}
      </KeyboardAvoidingView>
      {reportFor ? <ChatReportSheet target={reportFor} onClose={closeReport} onBlocked={leave} onChatClosed={leave} /> : null}
      {menuFor ? (
        <MessageActionsOverlay
          anchorY={menuFor.y}
          showReactions={menuFor.row.id !== null && !menuFor.row.deleted}
          mine={menuFor.row.id ? (reactions?.[menuFor.row.id]?.mine ?? null) : null}
          actions={messageActions}
          onReact={(key) => reactTo(menuFor.row, key)}
          onClose={closeMenu}
        />
      ) : null}
      <ActionSheet visible={failedFor !== null} title="Not sent" actions={failedActions} onClose={() => setFailedFor(null)} />
      <ActionSheet visible={chatMenu} actions={chatActions} onClose={() => setChatMenu(false)} />
    </View>
  );
}
