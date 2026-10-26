import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

type AuthState = {
  /** Null for guests and until the persisted session is read (in the background). */
  session: Session | null;
  /** True once the persisted session has been read (or failed to read). */
  restored: boolean;
  setSession: (session: Session | null) => void;
  markRestored: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  restored: false,
  setSession: (session) => set({ session }),
  markRestored: () => set({ restored: true }),
}));
