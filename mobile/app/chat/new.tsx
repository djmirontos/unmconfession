import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatHeader, type ChatHeaderMember } from '@/components/chat/ChatHeader';
import { EmptyState } from '@/components/feed/ListStates';
import { Button } from '@/components/ui/Button';
import { useChatScreenGuard } from '@/hooks/useChatScreenGuard';
import { useFirstMessage } from '@/hooks/useFirstMessage';
import { useTheme } from '@/hooks/useTheme';
import { useUserProfile } from '@/hooks/useUserProfile';
import { chatKeys, type Conversation, firstMessageRoute, newChatHint, REQUEST_MAX } from '@/lib/chat';
import { isValidUserId as isUuid } from '@/lib/profileView';
import { useAuthStore } from '@/stores/authStore';

/**
 * A chat with someone I have no chat with yet. The header comes from their profile (already
 * cached when opened from it; nothing else is asked). The first message is the request
 * (send_chat_request, 200 characters, a counter always shown); then this page becomes
 * /chat/<id> showing it as waiting.
 */
export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const ready = useChatScreenGuard();
  const myId = useAuthStore((s) => s.session?.user.id ?? '');
  const { with: rawWith } = useLocalSearchParams<{ with: string }>();
  const otherId = isUuid(rawWith) ? rawWith.toLowerCase() : null;
  const profile = useUserProfile(ready && otherId !== myId ? otherId : null, true);
  const other = profile.data;

  // A chat that already exists (a link, or the list changed): open it instead. Cache only, no request.
  useEffect(() => {
    if (!ready || !otherId) return;
    const existing = queryClient.getQueryData<Conversation[]>(chatKeys.conversations(myId))?.find((c) => c.otherId === otherId);
    if (existing) router.replace(firstMessageRoute(existing.id));
  }, [ready, otherId, myId, queryClient, router]);

  const target = useMemo(
    () => (other?.nickname ? { id: other.id, nickname: other.nickname, avatarKey: other.avatar_key } : null),
    [other],
  );
  const header = useMemo<ChatHeaderMember | null>(() => (target ? { ...target, online: false } : null), [target]);
  const first = useFirstMessage(target);
  const openRequests = useCallback(() => router.replace('/chat/requests'), [router]);

  const unavailable = ready && (otherId === null || otherId === myId || (profile.data !== undefined && target === null) || profile.isError);

  let body;
  if (unavailable) {
    body = (
      <View className="gap-4 p-4">
        <EmptyState icon="chatbubbles-outline" title="You can't start a chat with this member" />
        <Button label="Back" variant="secondary" icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'))} />
      </View>
    );
  } else {
    body = (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Ionicons name="chatbubbles-outline" size={40} color={colors.chatAccent} />
        <Text className="text-center text-base text-text-dim">{target ? newChatHint(target.nickname) : ' '}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-chat-bg" style={{ paddingTop: insets.top }}>
      <ChatHeader member={unavailable ? null : header} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1">{body}</View>
        {target && !unavailable ? (
          <ChatComposer
            draftKey={null}
            onSend={first.send}
            max={REQUEST_MAX}
            counterFrom={0}
            placeholder="Write a first message"
            error={first.error?.message ?? null}
            errorAction={first.error?.action === 'requests' ? <Button label="Open Requests" variant="secondary" icon="mail-unread-outline" onPress={openRequests} /> : null}
          />
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
