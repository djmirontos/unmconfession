import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostListView } from '@/components/feed/PostListView';
import { TabHeader } from '@/components/layout/TabHeader';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { useActivePolls, useTrendingPosts } from '@/hooks/useTrending';

type Segment = 'trending' | 'polls';
const SEGMENTS = [
  { value: 'trending', label: 'Trending' },
  { value: 'polls', label: 'Polls' },
] as const;

// The last segment, for this app session only.
let lastSegment: Segment = 'trending';

export default function TrendingScreen() {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>(lastSegment);
  const trending = useTrendingPosts();
  const polls = useActivePolls();

  const choose = (value: Segment) => {
    lastSegment = value;
    setSegment(value);
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <Text accessibilityRole="header" className="flex-1 text-xl font-bold tracking-wide text-text">
          Trending
        </Text>
        <NotificationBell />
      </TabHeader>
      <View className="px-4 pt-3">
        <ChipGroup options={SEGMENTS} value={segment} onChange={choose} accessibilityLabel="Show" />
      </View>
      {/* Both stay mounted so switching keeps each list's scroll position and never reloads. */}
      <View className="flex-1" style={segment === 'trending' ? undefined : { display: 'none' }}>
        <PostListView
          query={trending}
          active={segment === 'trending'}
          ranked
          empty={{ icon: 'flame-outline', title: 'Nothing is trending yet. React or comment on a post to get things moving.' }}
        />
      </View>
      <View className="flex-1" style={segment === 'polls' ? undefined : { display: 'none' }}>
        <PostListView
          query={polls}
          active={segment === 'polls'}
          empty={{ icon: 'stats-chart-outline', title: 'No active polls right now. Create one from the + tab.' }}
        />
      </View>
    </View>
  );
}
