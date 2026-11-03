import { create } from 'zustand';

import type { ThreadComment } from '@/lib/comments';

/** An unsent comment: its text and whether it answers or edits a comment. In memory only, never on disk. */
export type CommentDraft = { text: string; replyTo: ThreadComment | null; editing: ThreadComment | null };

/** One draft per post, shared by the comments sheet and the post screen. */
export const commentDraftKey = (postId: string) => `post:${postId}`;

export const isEmptyDraft = (d: CommentDraft) => d.text.trim() === '' && d.replyTo === null && d.editing === null;

type CommentDraftState = {
  drafts: Readonly<Record<string, CommentDraft>>;
  /** Stores the draft; an empty one removes the entry. */
  setDraft: (key: string, draft: CommentDraft) => void;
  clearDraft: (key: string) => void;
  /** Logout: nobody else's drafts survive on this phone. */
  clearAll: () => void;
};

export const useCommentDraftStore = create<CommentDraftState>((set) => ({
  drafts: {},
  setDraft: (key, draft) =>
    set((s) => {
      if (isEmptyDraft(draft)) {
        if (!(key in s.drafts)) return s;
        const { [key]: _removed, ...rest } = s.drafts;
        return { drafts: rest };
      }
      return { drafts: { ...s.drafts, [key]: draft } };
    }),
  clearDraft: (key) =>
    set((s) => {
      if (!(key in s.drafts)) return s;
      const { [key]: _removed, ...rest } = s.drafts;
      return { drafts: rest };
    }),
  clearAll: () => set({ drafts: {} }),
}));
