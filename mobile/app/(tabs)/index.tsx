import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLogo } from '@/components/brand/AppLogo';
import { FeedList } from '@/components/feed/FeedList';
import { TabHeader } from '@/components/layout/TabHeader';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <AppLogo showName />
      </TabHeader>
      <FeedList />
    </View>
  );
}
