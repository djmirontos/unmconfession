import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/feed/ListStates';
import { TabHeader } from '@/components/layout/TabHeader';

/**
 * Placeholder for a future Chats feature. The tab never opens it (its press shows a toast, see
 * app/(tabs)/_layout.tsx); this route exists because expo-router drops a tab without a file, and a
 * deep link can still land here, so it says what it is instead of showing a blank screen.
 */
export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <Text accessibilityRole="header" className="flex-1 text-xl font-bold tracking-wide text-text">
          Chats
        </Text>
      </TabHeader>
      <EmptyState icon="chatbubbles-outline" title="Chats are coming soon" />
    </View>
  );
}
