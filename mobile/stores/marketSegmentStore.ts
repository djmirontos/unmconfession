import { create } from 'zustand';

import type { ListingSection } from '@/lib/listingUpdates';

/** A Market segment someone asked for (a Feed banner); the Market tab shows it and clears the request. */
type MarketSegmentState = {
  requested: ListingSection | null;
  request: (section: ListingSection) => void;
  clear: () => void;
};

export const useMarketSegmentStore = create<MarketSegmentState>((set) => ({
  requested: null,
  request: (requested) => set({ requested }),
  clear: () => set({ requested: null }),
}));
