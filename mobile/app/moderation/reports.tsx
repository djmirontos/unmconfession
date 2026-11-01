import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { ReportQueueCard, ReportQueueCardSkeleton } from '@/components/moderation/ReportQueueCard';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { useModerationReports } from '@/hooks/useModerationReports';
import { useOpenReportCount } from '@/hooks/useOpenReportCount';
import { useStaffGuard } from '@/hooks/useStaffGuard';
import { useTheme } from '@/hooks/useTheme';
import { getModerationErrorMessage } from '@/lib/errors';
import type { ReportQueueItem } from '@/lib/moderation';

const keyExtractor = (item: ReportQueueItem) => item.key;

function Separator() {
  return <View className="h-3" />;
}

/** Staff: every item with open reports, oldest first report first. */
export default function ReportsQueueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const isStaff = useStaffGuard();
  const query = useModerationReports();
  const openCount = useOpenReportCount();
  const [pulling, setPulling] = useState(false);

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const openItem = useCallback(
    (item: ReportQueueItem) => router.push({ pathname: '/moderation/report/[type]/[id]', params: { type: item.type, id: item.id } }),
    [router],
  );
  const renderItem = useCallback(({ item }: ListRenderItemInfo<ReportQueueItem>) => <ReportQueueCard item={item} onOpen={openItem} />, [openItem]);

  const { refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const onRefresh = useCallback(() => {
    setPulling(true);
    void Promise.allSettled([refetch(), openCount.refetch()]).finally(() => setPulling(false));
  }, [refetch, openCount]);
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
        ListEmptyComponent={<EmptyState icon="checkmark-circle-outline" title="No open reports. All clear." />}
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <View className="py-3">
              <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
            </View>
          ) : (
            <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={!query.hasNextPage && items.length > 0} endLabel="That's every open report." />
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
      <BackHeader title="Reports" />
      {body}
    </View>
  );
}
