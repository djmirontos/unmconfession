import { create } from 'zustand';

import type { ShareItem } from '@/lib/share';

type ShareCardState = {
  /** shareKey of the item being shared, from the tap until the share sheet closes; null = idle. */
  busyKey: string | null;
  /** The card the root <ShareCardHost/> renders and captures; set once sharing is known to work. */
  job: { id: number; item: ShareItem } | null;
  /** False while another share runs (the tap is ignored). */
  begin: (key: string) => boolean;
  render: (item: ShareItem) => void;
  finish: () => void;
};

let nextJobId = 1;

// Global so one hidden card at the root serves every screen, and only one share runs at a time.
export const useShareCardStore = create<ShareCardState>((set, get) => ({
  busyKey: null,
  job: null,
  begin: (key) => {
    if (get().busyKey !== null) return false;
    set({ busyKey: key });
    return true;
  },
  render: (item) => set({ job: { id: nextJobId++, item } }),
  finish: () => set({ busyKey: null, job: null }),
}));
