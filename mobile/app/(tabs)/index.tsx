import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLogo } from '@/components/brand/AppLogo';
import { FeedList } from '@/components/feed/FeedList';
import { TabHeader } from '@/components/layout/TabHeader';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <View className="flex-1">
          <AppLogo showName />
        </View>
        <NotificationBell />
      </TabHeader>
      <FeedList />
    </View>
  );
}
