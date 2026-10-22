import { View } from 'react-native';

import { ComingSoon } from '@/components/layout/ComingSoon';
import { TabScreen } from '@/components/layout/TabScreen';
import { Skeleton } from '@/components/ui/Skeleton';

export default function CreateScreen() {
  return (
    <TabScreen title="Create">
      <ComingSoon label="Confession, Shoutout, Poll, Buy & Sell and Lost & Found arrive in a later module." />
      <View className="gap-3">
        {[0, 1, 2, 3, 4].map((k) => (
          <Skeleton key={k} height={64} className="rounded-2xl" />
        ))}
      </View>
    </TabScreen>
  );
}
