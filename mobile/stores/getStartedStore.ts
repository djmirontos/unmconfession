import { create } from 'zustand';

import type { GetStartedStored } from '@/lib/getStarted';
import { readGetStarted, writeGetStarted } from '@/lib/getStartedStorage';

type GetStartedState = {
  /** Per user id; missing until that user's stored value has been read (the card waits, so it never flashes). */
  byUser: Record<string, GetStartedStored>;
  load: (userId: string) => void;
  /** Hides it now; the write is best effort, so a storage failure still hides it for this session. */
  finish: (userId: string, value: Exclude<GetStartedStored, 'none'>) => void;
};

const loading = new Set<string>();

export const useGetStartedStore = create<GetStartedState>((set, get) => ({
  byUser: {},
  load: (userId) => {
    if (loading.has(userId) || get().byUser[userId] !== undefined) return;
    loading.add(userId);
    void readGetStarted(userId).then((stored) => {
      loading.delete(userId);
      // A dismissal tapped while reading wins over the stored value.
      if (get().byUser[userId] === undefined) set((s) => ({ byUser: { ...s.byUser, [userId]: stored } }));
    });
  },
  finish: (userId, value) => {
    set((s) => ({ byUser: { ...s.byUser, [userId]: value } }));
    void writeGetStarted(userId, value);
  },
}));
