import { create } from 'zustand';

export type ParticipationAction =
  | 'post'
  | 'comment'
  | 'reply'
  | 'react'
  | 'vote'
  | 'report'
  | 'block'
  | 'share'
  | 'profile'
  | 'reactors'
  | 'default';

type SignInSheetState = {
  isOpen: boolean;
  action: ParticipationAction;
  open: (action: ParticipationAction) => void;
  close: () => void;
};

// Global so useRequireAuth() can open the single <SignInSheet/> mounted at the root.
export const useSignInSheetStore = create<SignInSheetState>((set) => ({
  isOpen: false,
  action: 'default',
  open: (action) => set({ isOpen: true, action }),
  close: () => set({ isOpen: false }),
}));
