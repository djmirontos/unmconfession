import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchListingsPage, type ListingCardData, type ListingFilters, type ListingsCursor, listingsKey } from '@/lib/listings';
import { useAuthStore } from '@/stores/authStore';

const STALE_MS = 60 * 1000;

/**
 * One Buy & Sell or Lost & Found list (guests too), newest first with keyset paging.
 * Each filter combination is its own cache entry; while a new one loads, the previous
 * list stays on screen instead of a spinner.
 */
export function useListings(filters: ListingFilters) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  const query = useInfiniteQuery({
    queryKey: listingsKey(userId, filters),
    queryFn: ({ pageParam }) => fetchListingsPage(filters, pageParam),
    initialPageParam: null as ListingsCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
  });

  // Flattened and de-duplicated: a listing can sit on two pages after a refetch.
  const listings = useMemo(() => {
    const seen = new Set<string>();
    const out: ListingCardData[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const listing of page.items) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        out.push(listing);
      }
    }
    return out;
  }, [query.data]);

  return { query, listings };
}
