import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListingGridCard } from '@/components/listings/ListingGridCard';
import { ListingCardSkeleton } from '@/components/skeletons/ListingCardSkeleton';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { BackToTopButton } from '@/components/ui/BackToTopButton';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { InlineCheckbox } from '@/components/ui/InlineCheckbox';
import { SearchField } from '@/components/ui/SearchField';
import { useBackToTop } from '@/hooks/useBackToTop';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useListings } from '@/hooks/useListings';
import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import { LISTING_SEARCH_MAX, type ListingCardData, type ListingFilters, type ListingKind } from '@/lib/listings';

const SEARCH_DEBOUNCE_MS = 400;
// 16 px sides; 8 px under the filter row so the first row sits right below it.
const LIST_PADDING = { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 };

type TypeFilter = 'all' | 'lost' | 'found';
const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'lost', label: 'Lost' },
  { value: 'found', label: 'Found' },
] as const;

const keyExtractor = (listing: ListingCardData) => listing.id;

type Props = {
  kind: ListingKind;
  /** False while the other section is shown: no focus refetch. */
  active: boolean;
  onOpen: (id: string) => void;
};

function emptyCopy(kind: ListingKind, search: string, type: TypeFilter, hideClosed: boolean) {
  if (search) return { icon: 'search-outline' as const, title: `No results for "${search}"`, message: 'Check the spelling or try another word.' };
  if (kind === 'sell') {
    return {
      icon: 'pricetags-outline' as const,
      title: hideClosed ? 'Nothing for sale right now' : 'Nothing for sale yet',
      message: 'Have something to sell? Tap Create to list it.',
    };
  }
  return {
    icon: 'search-outline' as const,
    title: type === 'lost' ? 'No lost items posted' : type === 'found' ? 'No found items posted' : 'Nothing here yet',
    message: 'Lost or found something on campus? Tap Create to post it.',
  };
}

/**
 * One half of the Buy & Sell tab: its own search, filters and list. Filters run on the
 * server (keyset paging); while a new combination loads, the previous list stays, dimmed.
 */
export function ListingsSection({ kind, active, onOpen }: Props) {
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<ListingCardData>>(null);
  const [rawSearch, setRawSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [hideClosed, setHideClosed] = useState(true);
  const [pulling, setPulling] = useState(false);

  const trimmed = rawSearch.trim().slice(0, LISTING_SEARCH_MAX);
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  // Clearing applies at once; typing waits for the pause.
  const search = trimmed === '' ? '' : debounced;

  const filters = useMemo<ListingFilters>(
    () => ({ kind, lostFoundType: kind === 'lost_found' && type !== 'all' ? type : null, hideClosed, search }),
    [kind, type, hideClosed, search],
  );
  const { query, listings } = useListings(filters);
  useRefetchWhenStale(query, active);
  const backToTop = useBackToTop(listRef);

  // A new filter combination starts at the top.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filters]);

  const isGrid = kind === 'sell';
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ListingCardData>) =>
      isGrid ? (
        // Half the 12 px gutter on each side of the middle.
        <View style={{ paddingLeft: index % 2 === 1 ? 6 : 0, paddingRight: index % 2 === 0 ? 6 : 0 }} className="pb-3">
          <ListingGridCard listing={item} onOpen={onOpen} />
        </View>
      ) : (
        <View className="pb-3">
          <ListingCard listing={item} onOpen={onOpen} showCommentCount />
        </View>
      ),
    [isGrid, onOpen],
  );

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);

  const refetch = query.refetch;
  const onRefresh = useCallback(async () => {
    setPulling(true);
    await refetch();
    setPulling(false);
  }, [refetch]);

  const closedLabel = kind === 'sell' ? 'Hide sold' : 'Hide returned';
  const controls = (
    <View className="gap-2 px-4 pt-3">
      <SearchField
        value={rawSearch}
        onChangeText={setRawSearch}
        placeholder={kind === 'sell' ? 'Search Buy & Sell' : 'Search Lost & Found'}
        maxLength={LISTING_SEARCH_MAX}
      />
      {/* Wraps the toggle onto a second line on narrow phones instead of overflowing. */}
      <View className="flex-row flex-wrap items-center justify-between gap-x-3">
        {kind === 'lost_found' ? (
          <ChipGroup options={TYPE_OPTIONS} value={type} onChange={setType} accessibilityLabel="Show" />
        ) : null}
        <InlineCheckbox checked={hideClosed} onChange={setHideClosed} label={closedLabel} />
      </View>
    </View>
  );

  // First load (or a failed switch to a new filter): skeletons or the error. Afterwards cached cards stay.
  const showFull = !query.data || (query.isError && query.isPlaceholderData);
  let body;
  if (showFull) {
    body = (
      <View className="flex-1 px-4 pt-2">
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void refetch()} />
        ) : isGrid ? (
          <SkeletonList item={ListingCardSkeleton} count={4} columns={2} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={3} />
        )}
      </View>
    );
  } else {
    const empty = emptyCopy(kind, search, type, hideClosed);
    body = (
      <View className="flex-1" style={query.isPlaceholderData ? { opacity: 0.5 } : undefined}>
        <FlashList
          ref={listRef}
          data={listings}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={isGrid ? 2 : 1}
          ListHeaderComponent={
            query.isRefetchError ? (
              <View className="pb-3">
                <RefreshErrorBanner onRetry={() => void refetch()} />
              </View>
            ) : null
          }
          ListEmptyComponent={<EmptyState icon={empty.icon} title={empty.title} message={empty.message} />}
          ListFooterComponent={
            query.isFetchNextPageError ? (
              <View className="py-3">
                <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
              </View>
            ) : (
              <ListFooter
                loadingMore={query.isFetchingNextPage}
                reachedEnd={!query.hasNextPage && listings.length > 0}
                endLabel="That's everything."
              />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onScroll={backToTop.onScroll}
          scrollEventThrottle={backToTop.scrollEventThrottle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={LIST_PADDING}
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
    );
  }

  return (
    <View className="flex-1">
      {controls}
      {body}
      {/* Outside the dimmed wrapper, so it never fades with the previous results. */}
      {showFull ? null : <BackToTopButton visible={backToTop.visible} onPress={backToTop.scrollToTop} />}
    </View>
  );
}
