import {
  accountKeyOf,
  createMarkerStore,
  clearShown,
  type ListingSection,
  type ListingUpdates,
  type ListRefetchResult,
  parseUpdates,
  readCounts,
  runVisit,
  type SectionUpdate,
  sinceArgs,
} from '@/lib/listingUpdates';
import { readMarkers, writeMarkers } from '@/lib/listingUpdatesStorage';
import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// The Feed's "new listings" banners: the one marker store, the count call, dismiss and the
// Market tab's visit rule. Rules live in lib/listingUpdates.ts.

export const LISTING_UPDATES_STALE_MS = 60 * 1000;
export const listingUpdatesKey = (accountKey: string) => ['listing-updates', accountKey] as const;

const markers = createMarkerStore({ read: readMarkers, write: writeMarkers });

/** The account whose markers apply right now (read at the moment it is called). */
export const currentAccountKey = () => accountKeyOf(useAuthStore.getState().session?.user.id);

/** A count answer that arrived after the account changed: thrown away, nothing stored. */
class StaleAccountError extends Error {}

/** Markers read from the phone first, then one call for both sections; seeds are stored, never shown. */
export async function fetchListingUpdates(accountKey: string): Promise<ListingUpdates> {
  await markers.hydrate(accountKey);
  const sent = markers.get(accountKey);
  const { data, error } = await supabase.rpc('get_listing_updates', sinceArgs(sent));
  if (error) {
    logError('rpc.get_listing_updates', error);
    throw error;
  }
  if (currentAccountKey() !== accountKey) throw new StaleAccountError('account changed');
  const { shown, seeds } = readCounts(sent, parseUpdates(data));
  for (const [section, mark] of seeds) markers.advance(accountKey, section, mark);
  return shown;
}

function hideSection(accountKey: string, section: ListingSection): void {
  queryClient.setQueryData<ListingUpdates>(listingUpdatesKey(accountKey), (data) => clearShown(data, section));
}

/** The ×: remembers the mark of the count on screen (not a newer one) and hides it at once. */
export function dismissListingUpdate(accountKey: string, section: ListingSection, shown: SectionUpdate): void {
  if (currentAccountKey() !== accountKey) return;
  markers.advance(accountKey, section, shown.mark);
  hideSection(accountKey, section);
}

/** Visit step a: the cached count if it is not older than its stale time, else a fresh one. */
async function freshUpdates(accountKey: string): Promise<ListingUpdates | null> {
  if (!useAuthStore.getState().restored) return null;
  try {
    return await queryClient.fetchQuery({
      queryKey: listingUpdatesKey(accountKey),
      queryFn: () => fetchListingUpdates(accountKey),
      staleTime: LISTING_UPDATES_STALE_MS,
    });
  } catch {
    return null;
  }
}

/**
 * Opening a Market segment (or pulling it to refresh): clears that section's banner only after a
 * fresh, successful load of the default list, with the mark taken before the load started.
 */
export function visitListingSection(input: {
  section: ListingSection;
  refetchList: () => Promise<ListRefetchResult>;
  filters: () => { search: string; lostFoundType: string };
  alwaysRefetch?: boolean;
}) {
  return runVisit({
    ...input,
    currentKey: currentAccountKey,
    freshUpdates,
    now: Date.now,
    commit: (accountKey, section, mark) => {
      markers.advance(accountKey, section, mark);
      hideSection(accountKey, section);
    },
  });
}

/** Sign-out / account switch: the in-memory copies go; each account's stored markers stay on the phone. */
export function resetListingUpdates(): void {
  markers.reset();
}

/** Account deleted: its in-memory copy and queued writes go (its storage key is removed by forgetDeletedAccount). */
export function forgetListingUpdates(userId: string): void {
  markers.forget(accountKeyOf(userId));
}
