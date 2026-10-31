import { skipToken, useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProfile } from '@/hooks/useProfile';
import { usePostgresChanges } from '@/hooks/usePostgresChanges';
import { bumpReplyCount, patchComment, type RepliesData, repliesKey, storeReply, type ThreadData } from '@/lib/commentCache';
import {
  type CommentCursor,
  type CommentTarget,
  createComment,
  createReply,
  deleteOwnComment,
  editOwnComment,
  fetchCommentPage,
  fetchOwnPending,
  fetchReplyPage,
  fromRow,
  type ThreadComment,
} from '@/lib/comments';
import { commentReactionBusy } from '@/lib/commentReactionSync';
import { getCommentErrorMessage, getErrorCode, getReplyErrorMessage } from '@/lib/errors';
import { bumpListingCommentCount } from '@/lib/listings';
import { bumpCommentCount } from '@/lib/postCounts';
import { breakdownTally, topFromBreakdown } from '@/lib/reactions';
import { parseTimestamp } from '@/lib/time';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

export type ActionResult = { ok: true; id: string } | { ok: false; message: string };

/** One row of the thread's single FlashList (top-level comments with their replies flattened in). */
export type ThreadRow =
  | { kind: 'comment'; key: string; comment: ThreadComment }
  | { kind: 'reply'; key: string; comment: ThreadComment }
  | { kind: 'viewReplies'; key: string; parentId: string; count: number; state: 'idle' | 'loading' | 'error' }
  | { kind: 'viewMoreReplies'; key: string; parentId: string; loading: boolean }
  | { kind: 'hideReplies'; key: string; parentId: string };

type Options = {
  /** True when the list is scrolled near its end (new comments from others are appended then). */
  isNearBottom: () => boolean;
  /** After new comments were appended at the end (e.g. scroll to them). */
  onAppended: () => void;
  /** The target's comment_count; an empty cached thread with a count above 0 is refetched. */
  expectedCount?: number;
};

// Reopening a thread a few seconds later refetches it; within that, the patched cache is shown.
const THREAD_STALE_MS = 10 * 1000;
// Realtime UPDATE of an unloaded comment counts as new only if it went public this recently (an approval).
const JUST_PUBLISHED_MS = 90 * 1000;

const byTime = (a: ThreadComment, b: ThreadComment) =>
  parseTimestamp(a.time) - parseTimestamp(b.time) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One comment thread (post or listing): top-level comments oldest first with keyset
 * paging, one level of replies loaded per comment on demand, my own held comments,
 * optimistic sends, replies, edit and delete, and live updates. Realtime payloads
 * only signal; display data comes from refetches (the payload has no nickname),
 * except body / edited_at / counts of comments already shown.
 */
export function useCommentThread(target: CommentTarget, targetId: string, { isNearBottom, onAppended, expectedCount = 0 }: Options) {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const profile = useProfile().data;
  const me = useMemo(
    () => (userId ? { id: userId, nickname: profile?.nickname ?? null, avatarKey: profile?.avatar_key ?? null } : null),
    [userId, profile?.nickname, profile?.avatar_key],
  );

  const threadKey = useMemo(() => ['comments', target, targetId] as const, [target, targetId]);
  const pendingKey = useMemo(() => ['comments-pending', target, targetId, userId ?? ''] as const, [target, targetId, userId]);

  const thread = useInfiniteQuery({
    queryKey: threadKey,
    queryFn: targetId ? ({ pageParam }) => fetchCommentPage(target, targetId, pageParam) : skipToken,
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: THREAD_STALE_MS,
  });
  const pending = useQuery({
    queryKey: pendingKey,
    queryFn: me && targetId ? () => fetchOwnPending(target, targetId, me) : skipToken,
    staleTime: THREAD_STALE_MS,
  });

  // Replies: collapsed by default; each expanded comment loads its first page (more on demand).
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const [loadingMoreReplies, setLoadingMoreReplies] = useState<ReadonlySet<string>>(new Set());
  const replyResults = useQueries({
    queries: expanded.map((parentId) => ({
      queryKey: repliesKey(parentId),
      queryFn: () => fetchReplyPage(parentId, null),
      staleTime: THREAD_STALE_MS,
    })),
    combine: (results) => results.map((r) => ({ data: r.data, isPending: r.isPending, isError: r.isError })),
  });

  // Local only: rows being sent, rows the server returned but no refetch has brought yet, and optimistic deletes.
  const [sending, setSending] = useState<ThreadComment[]>([]);
  const [posted, setPosted] = useState<ThreadComment[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [newCount, setNewCount] = useState(0);

  /** Cache first, then my held, just-posted and in-flight rows; `parentId` null = top level. */
  const collect = useCallback(
    (cached: readonly ThreadComment[], parentId: string | null) => {
      const byId = new Map<string, ThreadComment>();
      for (const c of cached) byId.set(c.id, c);
      for (const c of pending.data ?? []) if (c.parentId === parentId && !byId.has(c.id)) byId.set(c.id, c);
      for (const c of posted) if (c.parentId === parentId && !byId.has(c.id)) byId.set(c.id, c);
      for (const c of sending) if (c.parentId === parentId) byId.set(c.id, c);
      return [...byId.values()].filter((c) => !hidden.has(c.id)).sort(byTime);
    },
    [pending.data, posted, sending, hidden],
  );

  const items = useMemo(
    () => collect((thread.data?.pages ?? []).flatMap((p) => p.items), null),
    [collect, thread.data],
  );

  const rows = useMemo(() => {
    const out: ThreadRow[] = [];
    for (const comment of items) {
      out.push({ kind: 'comment', key: comment.id, comment });
      if (comment.state !== 'published') continue;
      const index = expanded.indexOf(comment.id);
      if (index < 0) {
        if (comment.replyCount > 0) {
          out.push({ kind: 'viewReplies', key: `view:${comment.id}`, parentId: comment.id, count: comment.replyCount, state: 'idle' });
        }
        continue;
      }
      const result = replyResults[index];
      if (!result?.data) {
        const state = result?.isError ? 'error' : 'loading';
        out.push({ kind: 'viewReplies', key: `view:${comment.id}`, parentId: comment.id, count: comment.replyCount, state });
        continue;
      }
      const replies = collect(result.data.items, comment.id);
      if (replies.length === 0) continue; // nothing left to show (e.g. the last reply was deleted)
      for (const reply of replies) out.push({ kind: 'reply', key: reply.id, comment: reply });
      if (result.data.nextCursor) {
        out.push({
          kind: 'viewMoreReplies',
          key: `more:${comment.id}`,
          parentId: comment.id,
          loading: loadingMoreReplies.has(comment.id),
        });
      }
      out.push({ kind: 'hideReplies', key: `hide:${comment.id}`, parentId: comment.id });
    }
    return out;
  }, [items, expanded, replyResults, collect, loadingMoreReplies]);

  const knownIds = useRef(new Set<string>());
  useEffect(() => {
    knownIds.current = new Set(rows.flatMap((r) => (r.kind === 'comment' || r.kind === 'reply' ? [r.comment.id] : [])));
  }, [rows]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: threadKey }),
      queryClient.invalidateQueries({ queryKey: pendingKey }),
      queryClient.invalidateQueries({ queryKey: ['replies'] }),
    ]);
  }, [queryClient, threadKey, pendingKey]);

  /** Marks the queries stale without refetching now: a reopened screen refetches, this one keeps the patched cache. */
  const markStale = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: threadKey, refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: pendingKey, refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: ['replies'], refetchType: 'none' });
  }, [queryClient, threadKey, pendingKey]);

  const setReplies = useCallback((parentId: string, open: boolean) => {
    setExpanded((list) => (open ? (list.includes(parentId) ? list : [...list, parentId]) : list.filter((id) => id !== parentId)));
  }, []);

  const loadMoreReplies = useCallback(
    async (parentId: string) => {
      const data = queryClient.getQueryData<RepliesData>(repliesKey(parentId));
      if (!data?.nextCursor || loadingMoreReplies.has(parentId)) return;
      setLoadingMoreReplies((set) => new Set(set).add(parentId));
      try {
        const page = await fetchReplyPage(parentId, data.nextCursor);
        queryClient.setQueryData<RepliesData>(repliesKey(parentId), (current) => {
          if (!current) return current;
          const ids = new Set(current.items.map((c) => c.id));
          return { items: [...current.items, ...page.items.filter((c) => !ids.has(c.id))], nextCursor: page.nextCursor };
        });
      } catch (error) {
        showToast(getCommentErrorMessage(error));
      } finally {
        setLoadingMoreReplies((set) => {
          const next = new Set(set);
          next.delete(parentId);
          return next;
        });
      }
    },
    [queryClient, loadingMoreReplies, showToast],
  );

  /**
   * Writes a server row into the cache so a reopened screen shows it.
   * Top level, published: replaced in place or appended to the last page (its stored
   * nextCursor is kept, so paging is unaffected and merge-by-id prevents duplicates).
   * Reply, published: replaced in or appended to its parent's loaded replies, and kept in
   * local `posted` too (a replies fetch already in flight must not drop it).
   * Pending: the pending list. Falls back to local `posted` when nothing is loaded.
   */
  const storeComment = useCallback(
    (item: ThreadComment) => {
      let stored = false;
      if (item.parentId) {
        if (item.state === 'published') storeReply(queryClient, item);
        else {
          queryClient.setQueryData<RepliesData>(repliesKey(item.parentId), (data) =>
            data ? { ...data, items: data.items.filter((c) => c.id !== item.id) } : data,
          );
        }
      } else {
        queryClient.setQueryData<ThreadData>(threadKey, (data) => {
          if (!data) return data;
          const without = data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== item.id) }));
          if (item.state !== 'published') return { ...data, pages: without };
          stored = true;
          const inPlace = data.pages.some((p) => p.items.some((c) => c.id === item.id));
          // In place (an edit): keep the reactions and reply count already shown; the server row has none of them.
          const pages = inPlace
            ? data.pages.map((p) => ({
                ...p,
                items: p.items.map((c) =>
                  c.id === item.id
                    ? { ...item, reactionCount: c.reactionCount, myReaction: c.myReaction, topReactions: c.topReactions, replyCount: c.replyCount }
                    : c,
                ),
              }))
            : without.map((p, i) => (i === without.length - 1 ? { ...p, items: [...p.items, item] } : p));
          return { ...data, pages };
        });
      }
      let heldStored = false;
      queryClient.setQueryData<ThreadComment[]>(pendingKey, (list) => {
        if (!list) return list;
        const without = list.filter((c) => c.id !== item.id);
        if (item.state !== 'pending') return without;
        heldStored = true;
        return [...without, item];
      });
      const keepLocal = item.parentId ? !heldStored : !(stored || heldStored);
      setPosted((list) => {
        const without = list.filter((c) => c.id !== item.id);
        return keepLocal ? [...without, item] : without;
      });
      markStale();
    },
    [queryClient, threadKey, pendingKey, markStale],
  );

  /** Removes a comment from every cache (after a delete). */
  const dropComment = useCallback(
    (id: string) => {
      patchComment(queryClient, id, () => null);
      queryClient.setQueryData<ThreadComment[]>(pendingKey, (list) => list?.filter((c) => c.id !== id));
      setPosted((list) => list.filter((c) => c.id !== id));
      markStale();
    },
    [queryClient, pendingKey, markStale],
  );

  // An empty cached thread while the post says it has comments is out of date: refetch once.
  const emptyRefetched = useRef(false);
  const publishedCount = (thread.data?.pages ?? []).reduce((n, p) => n + p.items.length, 0);
  useEffect(() => {
    if (!thread.data || thread.isFetching || emptyRefetched.current) return;
    if (publishedCount === 0 && expectedCount > 0) {
      emptyRefetched.current = true;
      void thread.refetch();
    }
  }, [thread, publishedCount, expectedCount]);

  /** comment_count of the post (feed, lists, detail) or the listing (screen, My Posts). */
  const bumpTargetCount = useCallback(
    (delta: number) => {
      if (target === 'post') bumpCommentCount(queryClient, targetId, delta);
      else bumpListingCommentCount(queryClient, targetId, delta);
    },
    [queryClient, target, targetId],
  );

  const localRow = useCallback(
    (body: string, parentId: string | null, replyToId: string | null): ThreadComment | null => {
      if (!me) return null;
      const now = new Date().toISOString();
      return {
        id: `local-${randomUUID()}`,
        body,
        authorId: me.id,
        nickname: me.nickname,
        avatarKey: me.avatarKey,
        time: now,
        createdAt: now,
        editedAt: null,
        state: 'sending',
        reactionCount: 0,
        myReaction: null,
        topReactions: [],
        parentId,
        replyToId,
        replyCount: 0,
      };
    },
    [me],
  );

  const send = useCallback(
    async (body: string): Promise<ActionResult> => {
      const temp = localRow(body, null, null);
      if (!temp || !me) return { ok: false, message: getCommentErrorMessage(new Error('not_authenticated')) };
      setSending((list) => [...list, temp]);
      try {
        const item = fromRow(await createComment(target, targetId, body), me);
        storeComment(item);
        if (item.state === 'published') bumpTargetCount(1);
        if (item.state === 'pending') showToast('Sent for review');
        return { ok: true, id: item.id };
      } catch (error) {
        return { ok: false, message: getCommentErrorMessage(error) };
      } finally {
        setSending((list) => list.filter((c) => c.id !== temp.id));
      }
    },
    [localRow, me, target, targetId, storeComment, bumpTargetCount, showToast],
  );

  /**
   * Replies to `to` (a top-level comment or a reply; the server files it under the top-level
   * one). Optimistic: the parent opens, a "Sending…" reply shows, and the parent's reply count
   * and the post's comment count go up at once. A held reply (pending) is not counted; a
   * failure takes both back and shows a toast.
   */
  const reply = useCallback(
    async (to: ThreadComment, body: string): Promise<ActionResult> => {
      const parentId = to.parentId ?? to.id;
      const temp = localRow(body, parentId, to.id);
      if (!temp || !me) return { ok: false, message: getReplyErrorMessage(new Error('not_authenticated')) };
      setSending((list) => [...list, temp]);
      setReplies(parentId, true);
      bumpReplyCount(queryClient, parentId, 1);
      bumpTargetCount(1);
      try {
        const item = fromRow(await createReply(to.id, body), me);
        storeComment(item);
        if (item.state === 'pending') {
          bumpReplyCount(queryClient, parentId, -1);
          bumpTargetCount(-1);
          showToast('Sent for review');
        }
        return { ok: true, id: item.id };
      } catch (error) {
        bumpReplyCount(queryClient, parentId, -1);
        bumpTargetCount(-1);
        const message = getReplyErrorMessage(error);
        showToast(message);
        if (getErrorCode(error) === 'not_found') void refetchAll();
        return { ok: false, message };
      } finally {
        setSending((list) => list.filter((c) => c.id !== temp.id));
      }
    },
    [localRow, me, queryClient, setReplies, bumpTargetCount, storeComment, showToast, refetchAll],
  );

  const edit = useCallback(
    async (comment: ThreadComment, body: string): Promise<ActionResult> => {
      if (!me) return { ok: false, message: getCommentErrorMessage(new Error('not_authenticated')) };
      try {
        const item = fromRow(await editOwnComment(comment.id, body), me);
        storeComment(item);
        if (comment.state === 'published' && item.state === 'pending') {
          bumpTargetCount(-1);
          if (item.parentId) bumpReplyCount(queryClient, item.parentId, -1);
        }
        showToast(item.state === 'pending' ? 'Sent for review' : 'Saved');
        return { ok: true, id: item.id };
      } catch (error) {
        return { ok: false, message: getCommentErrorMessage(error) };
      }
    },
    [me, storeComment, bumpTargetCount, queryClient, showToast],
  );

  /**
   * Hidden at once; the counts follow on success. A reply lowers its parent's reply count
   * and the post count by one. A top-level comment takes its replies with it (the server
   * removes them), so the post count drops by 1 + its reply count, and the post is
   * refetched so the server count takes over.
   */
  const remove = useCallback(
    async (comment: ThreadComment): Promise<void> => {
      setHidden((set) => new Set(set).add(comment.id));
      try {
        await deleteOwnComment(comment.id);
        dropComment(comment.id);
        if (comment.state === 'published') {
          if (comment.parentId) {
            bumpReplyCount(queryClient, comment.parentId, -1);
            bumpTargetCount(-1);
          } else {
            bumpTargetCount(-(1 + comment.replyCount));
            setReplies(comment.id, false);
            queryClient.removeQueries({ queryKey: repliesKey(comment.id) });
            void queryClient.invalidateQueries({ queryKey: [target, targetId] });
          }
        }
        showToast('Deleted');
      } catch (error) {
        setHidden((set) => {
          const next = new Set(set);
          next.delete(comment.id);
          return next;
        });
        showToast(getCommentErrorMessage(error));
      }
    },
    [queryClient, target, targetId, showToast, dropComment, bumpTargetCount, setReplies],
  );

  /** Pill: load the waiting comments and scroll to them. */
  const showNew = useCallback(async () => {
    setNewCount(0);
    await refetchAll();
    onAppended();
  }, [refetchAll, onAppended]);

  usePostgresChanges({
    table: 'comments',
    events: ['INSERT', 'UPDATE'],
    filter: `${target === 'post' ? 'post_id' : 'listing_id'}=eq.${targetId}`,
    topic: `comments:${target}:${targetId}`,
    enabled: targetId !== '',
    onChange: (row, event) => {
      if (row.status !== 'published') return;
      const loadedReplies = row.parent_id ? queryClient.getQueryData<RepliesData>(repliesKey(row.parent_id)) : undefined;
      const cached = knownIds.current.has(row.id) || (loadedReplies?.items.some((c) => c.id === row.id) ?? false);
      if (cached) {
        // A comment already shown: refresh body / edited_at, the reaction count and top 3 (the row
        // carries the exact tally) and, for top-level ones, the reply count. Never new, no pill.
        if (event === 'UPDATE') {
          const keepReactions = commentReactionBusy(row.id); // my own change in flight wins
          patchComment(queryClient, row.id, (c) => ({
            ...c,
            body: row.body,
            editedAt: row.edited_at,
            reactionCount: keepReactions ? c.reactionCount : row.reaction_count,
            topReactions: keepReactions ? c.topReactions : topFromBreakdown(row.reaction_breakdown),
            reactionBreakdown: keepReactions ? c.reactionBreakdown : breakdownTally(row.reaction_breakdown),
            replyCount: row.parent_id ? c.replyCount : row.reply_count,
          }));
        }
        return;
      }
      // Every reaction (and every new reply's reply_count) UPDATEs a comment row, so an UPDATE of a
      // comment not loaded here (an older page, a collapsed reply, a blocked author's) is not new.
      // The one exception is a held comment a moderator just approved: it turns published with
      // published_at = now(). "Just" is a 90 s window either side of the device clock, so moderate
      // clock skew still counts it once.
      if (event === 'UPDATE' && !row.published_at) return;
      if (event === 'UPDATE' && Math.abs(Date.now() - parseTimestamp(row.published_at ?? '')) > JUST_PUBLISHED_MS) return;
      if (row.author_id === userId) return; // my own: already handled locally
      bumpTargetCount(1);
      if (row.parent_id) {
        // A reply: never the pill or the top-level list. Its parent's reply_count arrives with the
        // parent's own UPDATE (the server trigger bumps it); open replies just refetch (merge by id).
        if (loadedReplies) void queryClient.invalidateQueries({ queryKey: repliesKey(row.parent_id) });
        return;
      }
      if (isNearBottom()) void refetchAll().then(onAppended);
      else setNewCount((n) => n + 1);
    },
    // Back from background or a reconnect: events may have been missed.
    onResubscribed: () => void refetchAll(),
  });

  return {
    rows,
    loading: thread.isPending && !thread.isError,
    error: thread.isError ? thread.error : null,
    retry: () => void thread.refetch(),
    hasMore: thread.hasNextPage,
    loadingMore: thread.isFetchingNextPage,
    loadMore: () => void thread.fetchNextPage(),
    newCount,
    showNew,
    send,
    reply,
    edit,
    remove,
    setReplies,
    loadMoreReplies,
    retryReplies: (parentId: string) => void queryClient.refetchQueries({ queryKey: repliesKey(parentId) }),
    myId: userId,
  };
}
