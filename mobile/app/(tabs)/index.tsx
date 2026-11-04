import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLogo } from '@/components/brand/AppLogo';
import { FeedList } from '@/components/feed/FeedList';
import { PostListView } from '@/components/feed/PostListView';
import { TabHeader } from '@/components/layout/TabHeader';
import { ModerationButton } from '@/components/moderation/ModerationButton';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useActivePolls, useTrendingPosts } from '@/hooks/useTrending';
import { FEED_VIEWS, type FeedView, getLastFeedView, mountedViews, setLastFeedView } from '@/lib/feedViews';

const hidden = { display: 'none' } as const;

/** Popular: the ranked list (get_trending). Mounted only once opened, so app start does not fetch it. */
function PopularList({ active }: { active: boolean }) {
  return (
    <PostListView
      query={useTrendingPosts()}
      active={active}
      ranked
      empty={{ icon: 'flame-outline', title: 'Nothing popular yet. React or comment on a post to get things moving.' }}
    />
  );
}

/** Polls: the open polls (get_active_polls). Mounted only once opened. */
function PollsList({ active }: { active: boolean }) {
  return (
    <PostListView
      query={useActivePolls()}
      active={active}
      empty={{ icon: 'stats-chart-outline', title: 'No active polls right now. Create one from the + tab.' }}
    />
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [view, setView] = useState<FeedView>(getLastFeedView);
  const [mounted, setMounted] = useState(() => mountedViews(new Set(), getLastFeedView()));

  const choose = (next: FeedView) => {
    setLastFeedView(next);
    setView(next);
    setMounted((previous) => mountedViews(previous, next));
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader>
        <View className="min-w-0 flex-1">
          <AppLogo showName />
        </View>
        <ModerationButton />
        <NotificationBell />
      </TabHeader>
      {/* Pinned above the lists (not in any list header), so a growing header can never move it. */}
      <View className="px-4 pb-1 pt-2">
        <SegmentedControl options={FEED_VIEWS} value={view} onChange={choose} accessibilityLabel="Feed view" />
      </View>
      {/* Each stays mounted once opened (hidden when not shown), keeping its query and scroll position. */}
      <View className="flex-1" style={view === 'latest' ? undefined : hidden}>
        <FeedList active={view === 'latest' && isFocused} />
      </View>
      {mounted.has('popular') ? (
        <View className="flex-1" style={view === 'popular' ? undefined : hidden}>
          <PopularList active={view === 'popular' && isFocused} />
        </View>
      ) : null}
      {mounted.has('polls') ? (
        <View className="flex-1" style={view === 'polls' ? undefined : hidden}>
          <PollsList active={view === 'polls' && isFocused} />
        </View>
      ) : null}
    </View>
  );
}
