import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

type AuthState = {
  /** Null for guests and until the persisted session is read (in the background). */
  session: Session | null;
  setSession: (session: Session | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
