import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { CommentCursor, CommentPage, ThreadComment } from '@/lib/comments';

/** Top-level comments of a post or listing (infinite, keyset pages). Not persisted. */
export type ThreadData = InfiniteData<CommentPage, CommentCursor | null>;
/** Loaded replies of one top-level comment: pages appended by "View more replies". Not persisted. */
export type RepliesData = CommentPage;

export const repliesKey = (parentId: string) => ['replies', parentId] as const;

/**
 * Applies `change` to the comment wherever it is cached: any thread (top-level) or any
 * replies list. Returning null removes it. Caches without it keep their identity.
 */
export function patchComment(
  queryClient: QueryClient,
  id: string,
  change: (comment: ThreadComment) => ThreadComment | null,
): void {
  const apply = (items: ThreadComment[]) =>
    items.flatMap((c) => {
      if (c.id !== id) return [c];
      const next = change(c);
      return next ? [next] : [];
    });
  queryClient.setQueriesData<ThreadData>({ queryKey: ['comments'] }, (data) => {
    if (!data || !data.pages.some((p) => p.items.some((c) => c.id === id))) return data;
    return { ...data, pages: data.pages.map((p) => ({ ...p, items: apply(p.items) })) };
  });
  queryClient.setQueriesData<RepliesData>({ queryKey: ['replies'] }, (data) => {
    if (!data || !data.items.some((c) => c.id === id)) return data;
    return { ...data, items: apply(data.items) };
  });
}

/** reply_count += delta (never below 0) on the top-level comment, wherever it is cached. */
export function bumpReplyCount(queryClient: QueryClient, parentId: string, delta: number): void {
  patchComment(queryClient, parentId, (c) => ({ ...c, replyCount: Math.max(0, c.replyCount + delta) }));
}

/** Adds (or replaces) a server reply in its parent's loaded replies. False when they are not loaded. */
export function storeReply(queryClient: QueryClient, reply: ThreadComment): boolean {
  if (!reply.parentId) return false;
  let stored = false;
  queryClient.setQueryData<RepliesData>(repliesKey(reply.parentId), (data) => {
    if (!data) return data;
    stored = true;
    const inPlace = data.items.some((c) => c.id === reply.id);
    // In place (an edit): keep the reactions already shown; the server row has none of them.
    const items = inPlace
      ? data.items.map((c) =>
          c.id === reply.id ? { ...reply, reactionCount: c.reactionCount, myReaction: c.myReaction, topReactions: c.topReactions } : c,
        )
      : [...data.items, reply];
    return { ...data, items };
  });
  return stored;
}
