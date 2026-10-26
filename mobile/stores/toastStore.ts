import { create } from 'zustand';

type ToastState = {
  message: string | null;
  /** Optional tap action (e.g. retry); the toast is only tappable when set. */
  onPress: (() => void) | null;
  /** Bumped on every show, so repeating the same message restarts the timer. */
  id: number;
  show: (message: string, onPress?: () => void) => void;
  hide: () => void;
};

// Global so any screen can show the single <Toast/> mounted at the root.
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  onPress: null,
  id: 0,
  show: (message, onPress) => set((s) => ({ message, onPress: onPress ?? null, id: s.id + 1 })),
  hide: () => set({ message: null, onPress: null }),
}));
