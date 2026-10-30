import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEED_BG, FEED_GAP, FEED_ITEM_STYLE, FeedCards } from '@/components/feed/feedCards';
import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { MyItemCard, rowTarget } from '@/components/myposts/MyItemCard';
import { OwnItemMenu } from '@/components/myposts/OwnItemMenu';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { BackToTopButton } from '@/components/ui/BackToTopButton';
import { useBackToTop } from '@/hooks/useBackToTop';
import { useMyPosts } from '@/hooks/useMyPosts';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import type { MyItem } from '@/lib/myPosts';

const keyExtractor = (item: MyItem) => `${item.source}:${item.id}`;
// Same pools as the Feed for posts (by kind); all listings share one, since sell and
// lost & found use the same card. Fewer pools = more reuse, fewer fresh mounts while scrolling.
const getItemType = (item: MyItem) => (item.source === 'post' ? item.kind : 'listing');

const EMPTY = (
  <EmptyState
    icon="create-outline"
    title="Nothing posted yet"
    message="Your confessions, shoutouts, polls and listings show up here with their review status."
  />
);

export default function MyPostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { query, items } = useMyPosts();
  const [pulling, setPulling] = useState(false);
  const [menuItem, setMenuItem] = useState<MyItem | null>(null);
  const listRef = useRef<FlashListRef<MyItem>>(null);
  const backToTop = useBackToTop(listRef);

  const openItem = useCallback(
    (item: MyItem) => {
      const target = rowTarget(item);
      if (target === 'post') router.push({ pathname: '/post/[id]', params: { id: item.id } });
      else if (target === 'listing') router.push({ pathname: '/listing/[id]', params: { id: item.id } });
      else router.push({ pathname: '/post-status', params: { source: item.source, id: item.id } });
    },
    [router],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MyItem>) => (
      <View style={FEED_ITEM_STYLE}>
        <MyItemCard item={item} onOpen={openItem} onMore={setMenuItem} />
      </View>
    ),
    [openItem],
  );

  // Stable list props (like the Feed), so screen re-renders while paging don't hand FlashList new ones.
  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);
  // Flush cards: no side gutter; the strip on top and the safe-area room at the bottom stay.
  const contentContainerStyle = useMemo(() => ({ paddingTop: FEED_GAP, paddingBottom: insets.bottom + 16 }), [insets.bottom]);
  const refetch = query.refetch;
  const fetchNextPage = query.fetchNextPage;
  const header = useMemo(
    () =>
      query.isRefetchError ? (
        <View className="px-4 pt-2.5" style={FEED_ITEM_STYLE}>
          <RefreshErrorBanner onRetry={() => void refetch()} />
        </View>
      ) : null,
    [query.isRefetchError, refetch],
  );
  const reachedEnd = !query.hasNextPage && items.length > 0;
  const footer = useMemo(
    () =>
      query.isFetchNextPageError ? (
        <View className="px-4">
          <RefreshErrorBanner onRetry={() => void fetchNextPage()} />
        </View>
      ) : (
        <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={reachedEnd} endLabel="That's everything." />
      ),
    [query.isFetchNextPageError, query.isFetchingNextPage, reachedEnd, fetchNextPage],
  );

  const onRefresh = useCallback(async () => {
    setPulling(true);
    await query.refetch();
    setPulling(false);
  }, [query]);

  let body;
  if (!query.data) {
    body = query.isError ? (
      <View className="p-4">
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </View>
    ) : (
      <View className={`flex-1 ${FEED_BG}`} style={{ paddingTop: FEED_GAP }}>
        <SkeletonList item={PostCardSkeleton} count={4} />
      </View>
    );
  } else {
    body = (
      <View className={`flex-1 ${FEED_BG}`}>
        <FlashList
          ref={listRef}
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onScroll={backToTop.onScroll}
          scrollEventThrottle={backToTop.scrollEventThrottle}
          contentContainerStyle={contentContainerStyle}
          ListHeaderComponent={header}
          ListEmptyComponent={EMPTY}
          ListFooterComponent={footer}
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
        <BackToTopButton visible={backToTop.visible} onPress={backToTop.scrollToTop} bottom={insets.bottom + 16} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="My Posts" />
      <FeedCards>{body}</FeedCards>
      <OwnItemMenu item={menuItem} onClose={() => setMenuItem(null)} withShare />
    </View>
  );
}
