import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { ConversationRow, ConversationSkeleton, RequestsRow } from '@/components/chat/ConversationRow';
import { EmptyState, ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { useAppActive } from '@/hooks/useAppActive';
import { useChatRequests, useChatUnread, useConversations } from '@/hooks/useChats';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { useTheme } from '@/hooks/useTheme';
import { type Conversation, pollInterval, sortConversations } from '@/lib/chat';
import { getChatError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

const keyExtractor = (c: Conversation) => c.id;

/** The Chats tab when chat is on: requests row, then the conversations, newest first. */
export function ChatList() {
  const router = useRouter();
  const { colors } = useTheme();
  const myId = useAuthStore((s) => s.session?.user.id ?? '');
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  // Timers only while this list is on screen and the app is open (chat is on, or this is not shown).
  const poll = pollInterval('list', { focused: isFocused, appActive, enabled: true }) !== false;
  const conversations = useConversations(poll);
  const requests = useChatRequests(poll);
  const unread = useChatUnread(poll);
  useRefetchWhenStale(conversations, true);
  useRefetchWhenStale(requests, true);
  useRefetchWhenStale(unread, true);
  // Relative times tick once a minute while the list is on screen.
  const now = useMinuteClock(isFocused);
  const [pulling, setPulling] = useState(false);

  const list = useMemo(() => sortConversations(conversations.data ?? []), [conversations.data]);
  const requestCount = requests.data?.length ?? 0;
  const open = useCallback((id: string) => router.push({ pathname: '/chat/[id]', params: { id } }), [router]);

  const refresh = useCallback(async () => {
    setPulling(true);
    await Promise.all([conversations.refetch(), requests.refetch(), unread.refetch()]);
    setPulling(false);
  }, [conversations, requests, unread]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Conversation>) => <ConversationRow conversation={item} myId={myId} now={now} onOpen={open} />,
    [myId, now, open],
  );

  if (!conversations.data) {
    return conversations.isError ? (
      <ErrorState message={getChatError(conversations.error, 'chat').message} onRetry={() => void refresh()} />
    ) : (
      <View accessibilityLabel="Loading chats" accessibilityRole="progressbar">
        {[0, 1, 2, 3, 4].map((i) => (
          <ConversationSkeleton key={i} />
        ))}
      </View>
    );
  }

  return (
    <FlashList
      data={list}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={now}
      ListHeaderComponent={
        <View>
          {conversations.isRefetchError ? (
            <View className="px-4 pt-3">
              <RefreshErrorBanner onRetry={() => void refresh()} />
            </View>
          ) : null}
          {requestCount > 0 ? <RequestsRow count={requestCount} onPress={() => router.push('/chat/requests')} /> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title="No chats yet" message="Open a member's profile and tap Message to start a chat." />
      }
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => void refresh()}
          tintColor={colors.chatAccent}
          colors={[colors.chatAccent]}
          progressBackgroundColor={colors.surface1}
        />
      }
    />
  );
}
