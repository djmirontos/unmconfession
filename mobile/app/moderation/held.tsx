import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { HeldQueueCard } from '@/components/moderation/HeldQueueCard';
import { ReportQueueCardSkeleton } from '@/components/moderation/ReportQueueCard';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { useHeldQueue } from '@/hooks/useHeldQueue';
import { useModerationCounts } from '@/hooks/useModerationCounts';
import { useStaffGuard } from '@/hooks/useStaffGuard';
import { useTheme } from '@/hooks/useTheme';
import { getModerationErrorMessage } from '@/lib/errors';
import type { HeldItem } from '@/lib/moderation';

const keyExtractor = (item: HeldItem) => item.key;

function Separator() {
  return <View className="h-3" />;
}

/** Staff: posts, comments and listings held for review, oldest first. */
export default function HeldQueueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const isStaff = useStaffGuard();
  const query = useHeldQueue();
  const counts = useModerationCounts();
  const [pulling, setPulling] = useState(false);

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const openItem = useCallback(
    (item: HeldItem) => router.push({ pathname: '/moderation/held/[type]/[id]', params: { type: item.type, id: item.id } }),
    [router],
  );
  const renderItem = useCallback(({ item }: ListRenderItemInfo<HeldItem>) => <HeldQueueCard item={item} onOpen={openItem} />, [openItem]);

  const { refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const onRefresh = useCallback(() => {
    setPulling(true);
    void Promise.allSettled([refetch(), counts.refetch()]).finally(() => setPulling(false));
  }, [refetch, counts]);
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const contentContainerStyle = useMemo(() => ({ padding: 16, paddingBottom: insets.bottom + 16 }), [insets.bottom]);

  if (!isStaff) return <View className="flex-1 bg-bg" />;

  let body;
  if (!query.data) {
    body = (
      <View className="p-4">
        {query.isError ? (
          <ErrorState message={getModerationErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <SkeletonList item={ReportQueueCardSkeleton} count={4} />
        )}
      </View>
    );
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={
          query.isRefetchError ? (
            <View className="pb-3">
              <RefreshErrorBanner onRetry={() => void query.refetch()} />
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" title="Nothing waiting for review." />}
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <View className="py-3">
              <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
            </View>
          ) : (
            <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={!query.hasNextPage && items.length > 0} endLabel="That's everything waiting." />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
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
      <BackHeader title="Held for review" />
      {body}
    </View>
  );
}
