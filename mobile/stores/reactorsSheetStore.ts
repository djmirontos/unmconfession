import { create } from 'zustand';

export type ReactorsTarget = { type: 'post' | 'comment'; id: string };

type ReactorsSheetState = {
  target: ReactorsTarget | null;
  open: (target: ReactorsTarget) => void;
  close: () => void;
};

// Global so any reaction stack can open the single <ReactorsSheet/> mounted at the root.
export const useReactorsSheetStore = create<ReactorsSheetState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
