import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { MyPostRow, rowTarget } from '@/components/myposts/MyPostRow';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyPosts } from '@/hooks/useMyPosts';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import type { MyItem } from '@/lib/myPosts';

const keyExtractor = (item: MyItem) => `${item.source}:${item.id}`;

function RowSkeleton() {
  return (
    <View className="gap-2 rounded-2xl border border-hairline bg-surface1 p-4">
      <Skeleton width="30%" height={10} />
      <Skeleton height={12} />
      <Skeleton width="25%" height={18} className="rounded-full" />
    </View>
  );
}

export default function MyPostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { query, items } = useMyPosts();
  const [pulling, setPulling] = useState(false);

  const openItem = useCallback(
    (item: MyItem) => {
      const target = rowTarget(item);
      if (target === 'post') router.push({ pathname: '/post/[id]', params: { id: item.id } });
      else if (target === 'status') router.push({ pathname: '/post-status', params: { source: item.source, id: item.id } });
    },
    [router],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MyItem>) => (
      <View className="pb-3">
        <MyPostRow item={item} onOpen={openItem} />
      </View>
    ),
    [openItem],
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
          <SkeletonList item={RowSkeleton} count={5} />
        )}
      </View>
    );
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          query.isRefetchError ? (
            <View className="pb-3">
              <RefreshErrorBanner onRetry={() => void query.refetch()} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="create-outline"
            title="Nothing posted yet"
            message="Your confessions, shoutouts, polls and listings show up here with their review status."
          />
        }
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
          ) : (
            <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={!query.hasNextPage && items.length > 0} endLabel="That's everything." />
          )
        }
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
    </View>
  );
}
