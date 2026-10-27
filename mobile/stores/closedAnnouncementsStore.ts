import { create } from 'zustand';

import { addClosedId } from '@/lib/announcementPick';
import { readClosedIds, writeClosedIds } from '@/lib/closedAnnouncements';

type ClosedAnnouncementsState = {
  /** Null until the stored list has been read (the card waits, so a closed one never flashes). */
  closedIds: string[] | null;
  load: () => void;
  /** Hides it now; the write is best effort, so a storage failure still closes it for this session. */
  close: (id: string) => void;
};

let loading = false;

export const useClosedAnnouncementsStore = create<ClosedAnnouncementsState>((set, get) => ({
  closedIds: null,
  load: () => {
    if (loading || get().closedIds !== null) return;
    loading = true;
    void readClosedIds().then((stored) => {
      // A close tapped while reading is kept on top of the stored list.
      const current = get().closedIds ?? [];
      set({ closedIds: current.reduce(addClosedId, stored) });
    });
  },
  close: (id) => {
    const next = addClosedId(get().closedIds ?? [], id);
    set({ closedIds: next });
    void writeClosedIds(next);
  },
}));
