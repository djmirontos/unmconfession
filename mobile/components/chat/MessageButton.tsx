import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { ChatRequestSheet } from '@/components/chat/ChatRequestSheet';
import { useStartChat } from '@/hooks/useStartChat';
import { useTheme } from '@/hooks/useTheme';
import type { Profile } from '@/hooks/useProfile';

/**
 * "Message" under a member's name. The profile screen renders it only while chat is on for the
 * viewer (useChatEnabled), on someone else's profile, for members. A deleted account has no button.
 */
export function MessageButton({ member }: { member: Profile }) {
  const { colors } = useTheme();
  const { start, checking, target, close } = useStartChat();
  if (member.nickname === null) return null;
  const nickname = member.nickname;

  return (
    <>
      <Pressable
        onPress={() => void start({ id: member.id, nickname, avatarKey: member.avatar_key })}
        disabled={checking}
        accessibilityRole="button"
        accessibilityLabel={`Message ${nickname}`}
        accessibilityState={{ busy: checking }}
        className="min-h-11 flex-row items-center gap-2 rounded-full bg-accent px-5 py-2 active:opacity-80"
      >
        {checking ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Ionicons name="chatbubble-outline" size={18} color={colors.onAccent} />}
        <Text className="text-sm font-bold text-on-accent">Message</Text>
      </Pressable>
      <ChatRequestSheet target={target} onClose={close} />
    </>
  );
}
