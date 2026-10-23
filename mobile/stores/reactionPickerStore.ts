import { create } from 'zustand';

import type { Anchor } from '@/components/reactions/pickerLayout';
import type { ReactionType } from '@/lib/reactions';

type PickerState = {
  /** Open picker: the button's window rect and what to do on a pick. Null = closed. */
  anchor: Anchor | null;
  current: ReactionType | null;
  /** 'drag': the finger is still down (overlay ignores touches); 'tap': lifted, emoji are tappable. */
  mode: 'drag' | 'tap';
  onPick: ((type: ReactionType) => void) | null;
  open: (anchor: Anchor, current: ReactionType | null, onPick: (type: ReactionType) => void) => void;
  setMode: (mode: 'drag' | 'tap') => void;
  close: () => void;
};

// Global so the single <ReactionPickerOverlay/> at the root draws above every list, and
// lists can turn scrolling off while it is open. Per-frame hover lives in pickerShared.ts.
export const useReactionPickerStore = create<PickerState>((set) => ({
  anchor: null,
  current: null,
  mode: 'drag',
  onPick: null,
  open: (anchor, current, onPick) => set({ anchor, current, onPick, mode: 'drag' }),
  setMode: (mode) => set({ mode }),
  close: () => set({ anchor: null, onPick: null, mode: 'drag' }),
}));

/** For lists: true while the picker is open (scrolling off). Changes only on open/close. */
export const usePickerOpen = () => useReactionPickerStore((s) => s.anchor !== null);
