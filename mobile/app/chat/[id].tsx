import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Clipboard, KeyboardAvoidingView, type ListRenderItemInfo, Platform, Pressable, Text, type TextInput, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatAvatar } from '@/components/chat/ConversationRow';
import { DayLine, MessageBubble, type MessageRow } from '@/components/chat/MessageBubble';
import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { MoreButton } from '@/components/myposts/MoreButton';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppActive } from '@/hooks/useAppActive';
import { useBlockUser } from '@/hooks/useBlockUser';
import { useChatMessages } from '@/hooks/useChatMessages';
import { invalidateChatLists, useConversations } from '@/hooks/useChats';
import { useChatScreenGuard } from '@/hooks/useChatScreenGuard';
import { useTheme } from '@/hooks/useTheme';
import { buildChatRows, type ChatRow, chatKeys, type Conversation, pollInterval, type ReplyRef, replyPreview } from '@/lib/chat';
import { deleteChatForMe, setChatMuted } from '@/lib/chatApi';
import { getChatError } from '@/lib/errors';
import { isValidUserId as isUuid } from '@/lib/profileView';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';

const keyExtractor = (row: ChatRow) => row.key;

function Header({ conversation, onMenu }: { conversation: Conversation | null; onMenu: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'));
  const online = conversation?.isOnline === true;
  return (
    <View className="h-14 flex-row items-center gap-2 border-b border-hairline px-2">
      <Pressable
        onPress={goBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="h-11 w-11 items-center justify-center rounded-full active:bg-surface2"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      {conversation ? (
        <ProfileLink userId={conversation.otherId} nickname={conversation.otherNickname} height={40} className="min-w-0 flex-1 flex-row items-center gap-2">
          <ChatAvatar userId={conversation.otherId} nickname={conversation.otherNickname} avatarKey={conversation.otherAvatarKey} online={online} size={36} />
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" numberOfLines={1} className="text-base font-bold text-text">
              {conversation.otherNickname}
            </Text>
            {online ? <Text className="text-xs font-semibold text-success">Online</Text> : null}
          </View>
        </ProfileLink>
      ) : (
        <View className="flex-1">
          <Skeleton width={140} height={16} />
        </View>
      )}
      {conversation ? <MoreButton onPress={onMenu} accessibilityLabel="Chat options" /> : null}
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

/** A 1:1 chat: newest at the bottom, swipe right to reply, long press for options. */
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

  const conversations = useConversations();
  const conversation = conversations.data?.find((c) => c.id === conversationId) ?? null;
  const missing = ready && (routeId === '' || (conversations.data !== undefined && !conversations.isFetching && conversation === null));
  const chat = useChatMessages(conversation ? conversationId : '', pollMs !== false && conversation !== null, pollMs);
  const nickname = conversation?.otherNickname ?? '';

  // Composer: starts from this chat's draft (memory only) and saves every change back.
  const [saved] = useState(() => useChatStore.getState().drafts[routeId]);
  const [text, setText] = useState(saved?.text ?? '');
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(saved?.replyTo ?? null);
  useEffect(() => {
    if (routeId) useChatStore.getState().setDraft(routeId, { text, replyTo });
  }, [routeId, text, replyTo]);
  const inputRef = useRef<TextInput>(null);

  const [now] = useState(() => Date.now());
  const rows = useMemo(() => buildChatRows(chat.server, chat.outgoing, myId, now), [chat.server, chat.outgoing, myId, now]);

  // Reply (swipe or menu) focuses the composer; the effect keeps the ref out of render.
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest === 0) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [focusRequest]);
  const startReply = useCallback((row: MessageRow) => {
    if (!row.id) return;
    setReplyTo({ id: row.id, body: row.deleted ? null : row.body, senderId: row.senderId });
    setFocusRequest((n) => n + 1);
  }, []);

  const send = () => {
    if (!conversation) return;
    chat.send(text, replyTo);
    setText('');
    setReplyTo(null);
  };

  // Long press: Reply, Copy, Delete (mine only). A failed message: Retry or Remove.
  const [menuFor, setMenuFor] = useState<MessageRow | null>(null);
  const [failedFor, setFailedFor] = useState<MessageRow | null>(null);
  const [chatMenu, setChatMenu] = useState(false);

  const { remove, retry, discard } = chat;
  const server = chat.server;
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

  const messageActions = useMemo<SheetAction[]>(() => {
    if (!menuFor) return [];
    const row = menuFor;
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
    return [live ? reply : null, copy, live && row.mine ? del : null].filter((a): a is SheetAction => a !== null);
  }, [menuFor, startReply, confirmDelete, showToast]);

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
          if (body && text.trim() === '') setText(body);
        },
      },
    ];
  }, [failedFor, retry, discard, text]);

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
          Alert.alert('Delete this chat?', 'This removes the chat for you only.', [
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

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatRow>) =>
      item.kind === 'day' ? (
        <DayLine label={item.label} />
      ) : (
        <MessageBubble row={item} myId={myId} otherNickname={nickname} onReply={startReply} onMenu={setMenuFor} onFailedPress={setFailedFor} />
      ),
    [myId, nickname, startReply],
  );

  const { query, loadOlder } = chat;
  let body;
  if (missing) {
    body = (
      <View className="gap-4 p-4">
        <EmptyState icon="chatbubbles-outline" title="This chat isn't available" />
        <Button label="Back to Chats" variant="secondary" onPress={() => router.replace('/(tabs)/chats')} />
      </View>
    );
  } else if (!conversation && conversations.isError) {
    body = <ErrorState message={getChatError(conversations.error, 'chat').message} onRetry={() => void conversations.refetch()} />;
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

  const replying = replyTo ? replyPreview({ replyToId: replyTo.id, replyBody: replyTo.body, replySenderId: replyTo.senderId }, myId, nickname) : null;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <Header conversation={conversation} onMenu={() => setChatMenu(true)} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1">{body}</View>
        {conversation ? (
          <ChatComposer
            inputRef={inputRef}
            value={text}
            onChangeText={setText}
            onSend={send}
            replying={replying}
            onCancelReply={() => setReplyTo(null)}
          />
        ) : null}
      </KeyboardAvoidingView>
      <ActionSheet visible={menuFor !== null} actions={messageActions} onClose={() => setMenuFor(null)} />
      <ActionSheet visible={failedFor !== null} title="Not sent" actions={failedActions} onClose={() => setFailedFor(null)} />
      <ActionSheet visible={chatMenu} actions={chatActions} onClose={() => setChatMenu(false)} />
    </View>
  );
}
