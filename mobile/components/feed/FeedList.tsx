import { FlashList, type FlashListRef, type ListRenderItemInfo, type ViewToken } from '@shopify/flash-list';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, RefreshControl, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AnnouncementCard } from '@/components/feed/AnnouncementCard';
import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { NewPostsPill } from '@/components/feed/NewPostsPill';
import { PostCard } from '@/components/feed/PostCard';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { BackToTopButton } from '@/components/ui/BackToTopButton';
import { useAnnouncement } from '@/hooks/useAnnouncement';
import { useAppActive } from '@/hooks/useAppActive';
import { useBackToTop } from '@/hooks/useBackToTop';
import { useFeed } from '@/hooks/useFeed';
import { useNewPosts } from '@/hooks/useNewPosts';
import { usePostCountsRefresh } from '@/hooks/usePostCountsRefresh';
import { usePostListActions } from '@/hooks/usePostListActions';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import type { FeedPost } from '@/lib/posts';
import { usePickerOpen } from '@/stores/reactionPickerStore';

// Within this distance of the top, new posts merge in silently instead of showing the pill.
const AT_TOP_PX = 80;
const VIEWABILITY = { itemVisiblePercentThreshold: 30 };
// Merged posts show at the top when the user is there; deeper down the position holds.
const KEEP_POSITION = { autoscrollToTopThreshold: AT_TOP_PX };

const keyExtractor = (post: FeedPost) => post.id;
const getItemType = (post: FeedPost) => post.kind;

export function FeedList() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const appActive = useAppActive();
  const isFocused = useIsFocused();
  const { query, posts, refreshTop } = useFeed();
  const announcement = useAnnouncement();
  // The reaction picker owns the touch while open; the list must not scroll under it.
  const pickerOpen = usePickerOpen();
  const listRef = useRef<FlashListRef<FeedPost>>(null);
  const atTopRef = useRef(true);
  const [atTop, setAtTop] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [topRefreshFailed, setTopRefreshFailed] = useState(false);
  const visibleIds = useRef<string[]>([]);
  const inFlight = useRef<Promise<void> | null>(null);

  // Coalesced: a burst of realtime events triggers one page-1 fetch.
  const runTopRefresh = useCallback(() => {
    inFlight.current ??= refreshTop()
      .then(() => setTopRefreshFailed(false))
      .catch((error: unknown) => {
        logError('feed.refreshTop', error);
        setTopRefreshFailed(true);
      })
      .finally(() => {
        inFlight.current = null;
      });
    return inFlight.current;
  }, [refreshTop]);

  // At the top, new posts merge in silently. Scrolled down, they wait behind the pill,
  // so nothing is ever inserted under the user's thumb.
  const isAtTop = useCallback(() => atTopRef.current, []);
  const mergeNow = useCallback(() => void runTopRefresh(), [runTopRefresh]);
  // Missed events (long background, reconnects) are caught up inside useNewPosts.
  const { pendingCount, clear } = useNewPosts(posts, isAtTop, mergeNow);
  const pendingRef = useRef(pendingCount);
  useEffect(() => {
    pendingRef.current = pendingCount;
  }, [pendingCount]);

  usePostCountsRefresh(() => visibleIds.current, appActive && isFocused);

  // Open / comments / share, and "⋯" (Report / Block) on other members' posts; own posts keep no menu here.
  const { onAction, openPost, openComments, sharePost, moreFor, menu } = usePostListActions();

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedPost>) => (
      <View className="pb-3">
        <PostCard
          post={item}
          onOpen={openPost}
          onAction={onAction}
          onComment={openComments}
          onShare={sharePost}
          onMore={moreFor(item)}
        />
      </View>
    ),
    [openPost, onAction, openComments, sharePost, moreFor],
  );

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedPost>[] }) => {
    visibleIds.current = viewableItems.map((token) => token.key);
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const top = e.nativeEvent.contentOffset.y < AT_TOP_PX;
    if (top === atTopRef.current) return;
    atTopRef.current = top;
    setAtTop(top);
    // Scrolled back up by hand while posts were waiting: merge them now.
    if (top && pendingRef.current > 0) {
      clear();
      void runTopRefresh();
    }
  }, [clear, runTopRefresh]);
  const backToTop = useBackToTop(listRef, onScroll);

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);

  const onRefresh = useCallback(async () => {
    setPulling(true);
    clear();
    await runTopRefresh();
    setPulling(false);
  }, [clear, runTopRefresh]);

  const onPillPress = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    clear();
    void runTopRefresh();
  }, [clear, runTopRefresh, reduceMotion]);

  const refreshFailed = query.isRefetchError || topRefreshFailed;
  const header = useMemo(
    () => (
      <View className="gap-3 pb-3">
        {refreshFailed ? <RefreshErrorBanner onRetry={() => void runTopRefresh()} /> : null}
        {announcement ? <AnnouncementCard announcement={announcement} /> : null}
      </View>
    ),
    [refreshFailed, announcement, runTopRefresh],
  );

  // First load only: skeletons. Afterwards cached posts stay on screen.
  if (!query.data) {
    return (
      <View className="flex-1 p-4">
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={4} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlashList
        ref={listRef}
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon="chatbubbles-outline" title="No confessions yet" message="Be the first to say something." />
        }
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <View className="py-3">
              <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
            </View>
          ) : (
            <ListFooter
              loadingMore={query.isFetchingNextPage}
              reachedEnd={!query.hasNextPage && posts.length > 0}
              endLabel="You're all caught up."
            />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onScroll={backToTop.onScroll}
        scrollEventThrottle={backToTop.scrollEventThrottle}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        maintainVisibleContentPosition={KEEP_POSITION}
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
      {atTop ? null : <NewPostsPill count={pendingCount} onPress={onPillPress} />}
      <BackToTopButton visible={backToTop.visible} onPress={backToTop.scrollToTop} />
      {menu}
    </View>
  );
}
