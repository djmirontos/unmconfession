import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chat/ConversationRow';
import { MoreButton } from '@/components/myposts/MoreButton';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';

export type ChatHeaderMember = { id: string; nickname: string; avatarKey: string | null; online: boolean };

type Props = {
  /** null while it is not known yet (a skeleton). */
  member: ChatHeaderMember | null;
  /** The chat menu; omitted on a new chat and a request waiting for an answer. */
  onMenu?: () => void;
};

/** Back, the other member (opens their profile), "Online" only when the server says so, the menu. */
function ChatHeaderImpl({ member, onMenu }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'));
  return (
    <View className="h-14 flex-row items-center gap-2 border-b border-hairline bg-chat-bg px-2">
      <Pressable
        onPress={goBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="h-11 w-11 items-center justify-center rounded-full active:bg-surface2"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      {member ? (
        <ProfileLink userId={member.id} nickname={member.nickname} height={40} className="min-w-0 flex-1 flex-row items-center gap-2">
          <ChatAvatar userId={member.id} nickname={member.nickname} avatarKey={member.avatarKey} online={member.online} size={36} ring="border-chat-bg" />
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" numberOfLines={1} className="text-base font-bold text-text">
              {member.nickname}
            </Text>
            {member.online ? <Text className="text-xs font-semibold text-text-dim">Online</Text> : null}
          </View>
        </ProfileLink>
      ) : (
        <View className="flex-1">
          <Skeleton width={140} height={16} />
        </View>
      )}
      {member && onMenu ? <MoreButton onPress={onMenu} accessibilityLabel="Chat options" /> : null}
    </View>
  );
}

export const ChatHeader = memo(ChatHeaderImpl);
