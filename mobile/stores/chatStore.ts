import { create } from 'zustand';

import { type OutboxAction, type Outgoing, outboxReduce, type ReplyRef } from '@/lib/chat';

/** An unsent chat message and what it answers. In memory only, never on disk. */
export type ChatDraft = { text: string; replyTo: ReplyRef | null };

const isEmpty = (d: ChatDraft) => d.text.trim() === '' && d.replyTo === null;

type ChatLocalState = {
  /** One draft per conversation id. */
  drafts: Readonly<Record<string, ChatDraft>>;
  /** Messages being sent or that failed, per conversation id. */
  outbox: Readonly<Record<string, readonly Outgoing[]>>;
  setDraft: (conversationId: string, draft: ChatDraft) => void;
  dispatch: (conversationId: string, action: OutboxAction) => void;
  /** Logout and account deletion: nothing of this account's chats stays on the phone. */
  clearAll: () => void;
};

export const useChatStore = create<ChatLocalState>((set) => ({
  drafts: {},
  outbox: {},
  setDraft: (conversationId, draft) =>
    set((s) => {
      if (!isEmpty(draft)) return { drafts: { ...s.drafts, [conversationId]: draft } };
      if (!(conversationId in s.drafts)) return s;
      const { [conversationId]: _removed, ...rest } = s.drafts;
      return { drafts: rest };
    }),
  dispatch: (conversationId, action) =>
    set((s) => {
      const next = outboxReduce(s.outbox[conversationId] ?? [], action);
      if (next.length > 0) return { outbox: { ...s.outbox, [conversationId]: next } };
      const { [conversationId]: _removed, ...rest } = s.outbox;
      return { outbox: rest };
    }),
  clearAll: () => set({ drafts: {}, outbox: {} }),
}));

const NO_OUTGOING: readonly Outgoing[] = [];
export const useOutbox = (conversationId: string) => useChatStore((s) => s.outbox[conversationId] ?? NO_OUTGOING);
