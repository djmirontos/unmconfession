import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationSkeleton } from '@/components/chat/ConversationRow';
import { EmptyState, ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { Avatar } from '@/components/profile/Avatar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Button } from '@/components/ui/Button';
import { useBlockUser } from '@/hooks/useBlockUser';
import { invalidateChatLists, useChatRequests } from '@/hooks/useChats';
import { useChatScreenGuard } from '@/hooks/useChatScreenGuard';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { useTheme } from '@/hooks/useTheme';
import { type ChatRequest, chatKeys } from '@/lib/chat';
import { fetchConversations, respondChatRequest } from '@/lib/chatApi';
import { getChatError } from '@/lib/errors';
import { formatRelative } from '@/lib/time';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const keyExtractor = (r: ChatRequest) => r.id;

type CardProps = {
  request: ChatRequest;
  now: number | undefined;
  busy: boolean;
  onAccept: (r: ChatRequest) => void;
  onDecline: (r: ChatRequest) => void;
  onBlock: (r: ChatRequest) => void;
};

function RequestCard({ request: r, now, busy, onAccept, onDecline, onBlock }: CardProps) {
  return (
    <View className="mx-4 mt-3 gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <View className="flex-row items-center gap-3">
        <ProfileLink userId={r.fromId} nickname={r.fromNickname} height={44} className="min-w-0 flex-1 flex-row items-center gap-3">
          <Avatar avatarKey={r.fromAvatarKey} userId={r.fromId} nickname={r.fromNickname} size={44} />
          <Text numberOfLines={1} className="shrink text-base font-bold text-text">
            {r.fromNickname}
          </Text>
        </ProfileLink>
        <Text className="text-xs text-text-dim">{formatRelative(r.requestedAt, now)}</Text>
      </View>
      <Text className="text-base text-text">{r.body}</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Accept" icon="checkmark" onPress={() => onAccept(r)} disabled={busy} />
        </View>
        <View className="flex-1">
          <Button label="Decline" variant="secondary" onPress={() => onDecline(r)} disabled={busy} />
        </View>
      </View>
      <Button label={`Block ${r.fromNickname}`} variant="ghost" icon="ban-outline" onPress={() => onBlock(r)} disabled={busy} />
    </View>
  );
}

/** Chat requests sent to me: accept (opens the chat), decline, or block the sender. */
export default function ChatRequestsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const block = useBlockUser();
  const ready = useChatScreenGuard();
  const userId = useAuthStore((s) => s.session?.user.id ?? '');
  const requests = useChatRequests();
  useRefetchWhenStale(requests, ready);
  const now = useMinuteClock(ready);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const respond = useCallback(
    async (r: ChatRequest, accept: boolean) => {
      setBusyId(r.id);
      try {
        await respondChatRequest(r.id, accept);
        invalidateChatLists(queryClient);
        showToast(accept ? 'Request accepted' : 'Request declined');
        if (accept) {
          // The chat screen needs the fresh list (it finds the other member there).
          await queryClient.fetchQuery({ queryKey: chatKeys.conversations(userId), queryFn: fetchConversations, staleTime: 0 }).catch(() => undefined);
          router.push({ pathname: '/chat/[id]', params: { id: r.id } });
        }
      } catch (error) {
        showToast(getChatError(error, 'respond').message);
        invalidateChatLists(queryClient);
      } finally {
        setBusyId(null);
      }
    },
    [queryClient, showToast, router, userId],
  );

  const onBlock = useCallback(
    (r: ChatRequest) => block({ id: r.fromId, nickname: r.fromNickname }, () => invalidateChatLists(queryClient)),
    [block, queryClient],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatRequest>) => (
      <RequestCard
        request={item}
        now={now}
        busy={busyId === item.id}
        onAccept={(r) => void respond(r, true)}
        onDecline={(r) => void respond(r, false)}
        onBlock={onBlock}
      />
    ),
    [now, busyId, respond, onBlock],
  );

  const refresh = async () => {
    setPulling(true);
    await requests.refetch();
    setPulling(false);
  };

  let body;
  if (!ready || (!requests.data && !requests.isError)) {
    body = (
      <View accessibilityLabel="Loading requests" accessibilityRole="progressbar">
        {[0, 1, 2].map((i) => (
          <ConversationSkeleton key={i} />
        ))}
      </View>
    );
  } else if (!requests.data) {
    body = <ErrorState message={getChatError(requests.error, 'chat').message} onRetry={() => void requests.refetch()} />;
  } else {
    body = (
      <FlashList
        data={requests.data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={busyId}
        ListHeaderComponent={
          requests.isRefetchError ? (
            <View className="px-4 pt-3">
              <RefreshErrorBanner onRetry={() => void requests.refetch()} />
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="mail-open-outline" title="No requests" message="When someone asks to chat with you, it shows here." />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface1}
          />
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Chat requests" />
      {body}
    </View>
  );
}
