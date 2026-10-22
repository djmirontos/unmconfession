import { create } from 'zustand';

type ToastState = {
  message: string | null;
  /** Bumped on every show, so repeating the same message restarts the timer. */
  id: number;
  show: (message: string) => void;
  hide: () => void;
};

// Global so any screen can show the single <Toast/> mounted at the root.
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  id: 0,
  show: (message) => set((s) => ({ message, id: s.id + 1 })),
  hide: () => set({ message: null }),
}));
