import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { type ReactElement, useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { FEED_BG, FEED_ITEM_STYLE, FEED_UNDER_HEADER_STYLE, FeedCards } from '@/components/feed/feedCards';
import { ListingCard } from '@/components/listings/ListingCard';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { useTheme } from '@/hooks/useTheme';
import { useUserListings } from '@/hooks/useUserProfile';
import { getErrorMessage } from '@/lib/errors';
import type { ListingCardData } from '@/lib/listings';

const keyExtractor = (listing: ListingCardData) => listing.id;

/** A member's listings on their profile: the Lost & Found card for both kinds, opens the listing. */
export function UserListings({ userId, head }: { userId: string; head: ReactElement }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [pulling, setPulling] = useState(false);
  const { query, listings } = useUserListings(userId);

  const openListing = useCallback((id: string) => router.push({ pathname: '/listing/[id]', params: { id } }), [router]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListingCardData>) => (
      <View style={FEED_ITEM_STYLE}>
        <ListingCard listing={item} onOpen={openListing} showCommentCount />
      </View>
    ),
    [openListing],
  );

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);

  const onRefresh = useCallback(async () => {
    setPulling(true);
    await query.refetch();
    setPulling(false);
  }, [query]);

  if (!query.data) {
    return (
      <FeedCards>
        <View className={`flex-1 pt-4 ${FEED_BG}`}>
          <View className="px-4">{head}</View>
          {query.isError ? (
            <View className="px-4">
              <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
            </View>
          ) : (
            <SkeletonList item={PostCardSkeleton} count={2} />
          )}
        </View>
      </FeedCards>
    );
  }

  return (
    <FeedCards>
      <View className={`flex-1 ${FEED_BG}`}>
        <FlashList
          data={listings}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={
            <View className="px-4 pt-4">
              {head}
              {query.isRefetchError ? (
                <View style={FEED_ITEM_STYLE}>
                  <RefreshErrorBanner onRetry={() => void query.refetch()} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={<EmptyState icon="pricetags-outline" title="No listings yet" />}
          ListFooterComponent={
            query.isFetchNextPageError ? (
              <View className="px-4 py-3">
                <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
              </View>
            ) : (
              <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={!query.hasNextPage && listings.length > 0} endLabel="That's everything." />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          contentContainerStyle={FEED_UNDER_HEADER_STYLE}
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
      </View>
    </FeedCards>
  );
}
