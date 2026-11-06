import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatList } from '@/components/chat/ChatList';
import { EmptyState } from '@/components/feed/ListStates';
import { TabHeader } from '@/components/layout/TabHeader';
import { useChatEnabled } from '@/hooks/useChatEnabled';

/**
 * Chats. While chat is not on for this viewer (useChatEnabled) it is the placeholder: the tab never
 * opens it (its press shows a toast, see app/(tabs)/_layout.tsx), but a deep link can still land
 * here, so it says what it is instead of showing a blank screen. When on: the chat list.
 */
export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const chatOn = useChatEnabled().enabled;
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <Text accessibilityRole="header" className="flex-1 text-xl font-bold tracking-wide text-text">
          Chats
        </Text>
      </TabHeader>
      {chatOn ? <ChatList /> : <EmptyState icon="chatbubbles-outline" title="Chats are coming soon" />}
    </View>
  );
}
