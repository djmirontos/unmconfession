import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

import { getErrorMessage } from '@/lib/errors';
import {
  closeActionLabel,
  fetchListing,
  findListedListing,
  type ListingCardData,
  listingKey,
  patchListingClosed,
  setListingClosed,
} from '@/lib/listings';
import type { MyPostsPage } from '@/lib/myPosts';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const STALE_MS = 60 * 1000;

/**
 * One published listing (null = unavailable: gone, held, removed or by someone I blocked).
 * Paints from a cached Buy & Sell / Lost & Found card or My Posts card while the row loads, then refetches.
 */
export function useListing(id: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useQuery({
    queryKey: listingKey(id, userId),
    queryFn: () => fetchListing(id),
    staleTime: STALE_MS,
    placeholderData: () => {
      const listed = findListedListing(queryClient, userId, id);
      if (listed) return listed;
      const cached = queryClient.getQueryData<InfiniteData<MyPostsPage>>(['my-posts', userId ?? '']);
      for (const page of cached?.pages ?? []) {
        const hit = page.items.find((i) => i.source === 'listing' && i.id === id && i.status === 'published');
        if (hit?.listingCard) return hit.listingCard;
      }
      return undefined;
    },
  });
}

/**
 * Owner toggle for sold / found / claimed. Closing asks once; reopening does not.
 * Optimistic in the listing screen and My Posts, rolled back with a toast on failure.
 */
export function useToggleListingClosed() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const inFlight = useRef(false);

  const run = useCallback(
    (listing: ListingCardData, closed: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      patchListingClosed(queryClient, listing.id, closed);
      setListingClosed(listing.id, closed)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['my-item'] });
        })
        .catch((error: unknown) => {
          patchListingClosed(queryClient, listing.id, !closed);
          showToast(getErrorMessage(error));
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [queryClient, showToast],
  );

  return useCallback(
    (listing: ListingCardData) => {
      if (listing.isClosed) return run(listing, false);
      const action = closeActionLabel(listing);
      Alert.alert(`${action}?`, 'People can still see it and comment. You can reopen it anytime.', [
        { text: 'Cancel', style: 'cancel' },
        { text: action, onPress: () => run(listing, true) },
      ]);
    },
    [run],
  );
}
