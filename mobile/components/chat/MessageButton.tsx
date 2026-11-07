import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import type { Profile } from '@/hooks/useProfile';
import { useStartChat } from '@/hooks/useStartChat';
import { useTheme } from '@/hooks/useTheme';

/**
 * "Message" under a member's name: opens the chat page (an existing chat, my waiting request, or a
 * new chat where the first message is the request). The profile screen renders it only while chat
 * is on for the viewer (useChatEnabled), on someone else's profile, for members. A deleted account
 * has no button. It keeps the profile's amber accent; the chat screens use the blue.
 */
export function MessageButton({ member }: { member: Profile }) {
  const { colors } = useTheme();
  const { start, checking } = useStartChat();
  if (member.nickname === null) return null;
  const nickname = member.nickname;

  return (
    <Pressable
      onPress={() => void start(member.id)}
      disabled={checking}
      accessibilityRole="button"
      accessibilityLabel={`Message ${nickname}`}
      accessibilityState={{ busy: checking }}
      className="min-h-11 flex-row items-center gap-2 rounded-full bg-accent px-5 py-2 active:opacity-80"
    >
      {checking ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Ionicons name="chatbubble-outline" size={18} color={colors.onAccent} />}
      <Text className="text-sm font-bold text-on-accent">Message</Text>
    </Pressable>
  );
}
