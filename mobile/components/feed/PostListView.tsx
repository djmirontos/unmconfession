import { FlashList, type FlashListRef, type ListRenderItemInfo, type ViewToken } from '@shopify/flash-list';
import type { UseQueryResult } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { EmptyState, ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { PostCard } from '@/components/feed/PostCard';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { BackToTopButton } from '@/components/ui/BackToTopButton';
import { useAppActive } from '@/hooks/useAppActive';
import { useBackToTop } from '@/hooks/useBackToTop';
import { usePostCountsRefresh } from '@/hooks/usePostCountsRefresh';
import { usePostListActions } from '@/hooks/usePostListActions';
import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import type { FeedPost } from '@/lib/posts';
import { usePickerOpen } from '@/stores/reactionPickerStore';

const VIEWABILITY = { itemVisiblePercentThreshold: 30 };
const keyExtractor = (post: FeedPost) => post.id;
const getItemType = (post: FeedPost) => post.kind;

type Props = {
  query: UseQueryResult<FeedPost[]>;
  /** False while another segment is shown: no refresh timers, no focus refetch. */
  active: boolean;
  /** Show the position as a rank badge (Trending). */
  ranked?: boolean;
  empty: { icon: 'flame-outline' | 'stats-chart-outline'; title: string };
};

/**
 * A single-page list of post cards (Trending, active polls) with the Feed's card
 * behaviour: open, comments, reactions, voting and the "⋯" menu. Refetches when it
 * comes into view or the app returns while the data is stale; counts refresh every
 * 30 s for the visible posts.
 */
export function PostListView({ query, active, ranked = false, empty }: Props) {
  const { colors } = useTheme();
  const appActive = useAppActive();
  const isFocused = useIsFocused();
  const pickerOpen = usePickerOpen();
  const [pulling, setPulling] = useState(false);
  const visibleIds = useRef<string[]>([]);
  const listRef = useRef<FlashListRef<FeedPost>>(null);
  const backToTop = useBackToTop(listRef);
  const { onAction, openPost, openComments, sharePost, moreFor, menu } = usePostListActions();

  const { refetch } = query;
  useRefetchWhenStale(query, active);

  usePostCountsRefresh(() => visibleIds.current, appActive && isFocused && active);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<FeedPost>) => (
      <View className="pb-3">
        <PostCard
          post={item}
          onOpen={openPost}
          onAction={onAction}
          onComment={openComments}
          onShare={sharePost}
          onMore={moreFor(item)}
          rank={ranked ? index + 1 : undefined}
        />
      </View>
    ),
    [openPost, onAction, openComments, sharePost, moreFor, ranked],
  );

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedPost>[] }) => {
    visibleIds.current = viewableItems.map((token) => token.key);
  }, []);

  const onRefresh = useCallback(async () => {
    setPulling(true);
    await refetch();
    setPulling(false);
  }, [refetch]);

  // First load only: skeletons. Afterwards the cached list stays on screen.
  if (!query.data) {
    return (
      <View className="flex-1 p-4">
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void refetch()} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={3} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlashList
        ref={listRef}
        data={query.data}
        onScroll={backToTop.onScroll}
        scrollEventThrottle={backToTop.scrollEventThrottle}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={
          query.isRefetchError ? (
            <View className="pb-3">
              <RefreshErrorBanner onRetry={() => void refetch()} />
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon={empty.icon} title={empty.title} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        scrollEnabled={!pickerOpen}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface1}
          />
        }
      />
      <BackToTopButton visible={backToTop.visible} onPress={backToTop.scrollToTop} />
      {menu}
    </View>
  );
}
