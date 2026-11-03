import { create } from 'zustand';

/** The post whose comments the sheet shows. */
export type CommentsSheetTarget = {
  postId: string;
  /** A Q&A post: answers, upvotes instead of reactions on them (same as the post screen). */
  answers: boolean;
  /** The post's comment_count when opened, so a stale empty thread is refetched. */
  expectedCount: number;
};

type CommentsSheetState = {
  target: CommentsSheetTarget | null;
  /** Opening another post's comments while one is open replaces it. */
  open: (target: CommentsSheetTarget) => void;
  close: () => void;
};

export const useCommentsSheetStore = create<CommentsSheetState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));

/** Closes the sheet from anywhere (navigation, logout). */
export const closeCommentsSheet = () => useCommentsSheetStore.getState().close();
