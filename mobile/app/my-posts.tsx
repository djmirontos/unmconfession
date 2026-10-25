import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { MyItemCard, rowTarget } from '@/components/myposts/MyItemCard';
import { OwnItemMenu } from '@/components/myposts/OwnItemMenu';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
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
      <View className="pb-3">
        <MyItemCard item={item} onOpen={openItem} onMore={setMenuItem} />
      </View>
    ),
    [openItem],
  );

  // Stable list props (like the Feed), so screen re-renders while paging don't hand FlashList new ones.
  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);
  const contentContainerStyle = useMemo(() => ({ padding: 16, paddingBottom: insets.bottom + 16 }), [insets.bottom]);
  const refetch = query.refetch;
  const fetchNextPage = query.fetchNextPage;
  const header = useMemo(
    () =>
      query.isRefetchError ? (
        <View className="pb-3">
          <RefreshErrorBanner onRetry={() => void refetch()} />
        </View>
      ) : null,
    [query.isRefetchError, refetch],
  );
  const reachedEnd = !query.hasNextPage && items.length > 0;
  const footer = useMemo(
    () =>
      query.isFetchNextPageError ? (
        <RefreshErrorBanner onRetry={() => void fetchNextPage()} />
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
    body = (
      <View className="p-4">
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={4} />
        )}
      </View>
    );
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
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
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="My Posts" />
      {body}
      <OwnItemMenu item={menuItem} onClose={() => setMenuItem(null)} />
    </View>
  );
}
