import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useMembership } from '@/hooks/useProfile';
import { useRefetchWhenStale } from '@/hooks/useRefetchWhenStale';
import { accountKeyOf, canQueryUpdates, LISTING_SECTIONS, type ListingSection, type SectionUpdate } from '@/lib/listingUpdates';
import { dismissListingUpdate, fetchListingUpdates, LISTING_UPDATES_STALE_MS, listingUpdatesKey } from '@/lib/listingUpdatesSync';
import { useAuthStore } from '@/stores/authStore';

export type ListingUpdateBanner = SectionUpdate & { section: ListingSection };

/**
 * The Feed's "new listings" banners (guests too). No call before the stored session is read and the
 * membership is known, and none while `active` is false (Popular or Polls shown); refetched on focus,
 * on return to the foreground and on pull to refresh, only when stale. Nothing shows while loading,
 * inactive or after a failed count.
 */
export function useListingUpdates(active = true) {
  const restored = useAuthStore((s) => s.restored);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { status } = useMembership();
  const accountKey = accountKeyOf(userId);
  const enabled = active && canQueryUpdates(restored, status);

  const query = useQuery({
    queryKey: listingUpdatesKey(accountKey),
    queryFn: () => fetchListingUpdates(accountKey),
    enabled,
    staleTime: LISTING_UPDATES_STALE_MS,
  });
  useRefetchWhenStale(query, enabled);

  const banners = useMemo<ListingUpdateBanner[]>(() => {
    if (!enabled || query.isError || !query.data) return [];
    const data = query.data;
    return LISTING_SECTIONS.flatMap((section) => {
      const update = data[section];
      return update && update.count > 0 ? [{ section, ...update }] : [];
    });
  }, [enabled, query.isError, query.data]);

  const { refetch } = query;
  /** Pull to refresh on the Feed (never before the guards allow a call). */
  const refresh = useCallback(async () => {
    if (enabled) await refetch();
  }, [enabled, refetch]);

  const dismiss = useCallback(
    (banner: ListingUpdateBanner) => dismissListingUpdate(accountKey, banner.section, banner),
    [accountKey],
  );

  return { banners, refresh, dismiss };
}
