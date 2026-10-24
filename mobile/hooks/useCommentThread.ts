import { type InfiniteData, skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProfile } from '@/hooks/useProfile';
import { usePostgresChanges } from '@/hooks/usePostgresChanges';
import {
  type CommentCursor,
  type CommentPage,
  type CommentTarget,
  createComment,
  deleteOwnComment,
  editOwnComment,
  fetchCommentPage,
  fetchOwnPending,
  fromRow,
  type ThreadComment,
} from '@/lib/comments';
import { getCommentErrorMessage } from '@/lib/errors';
import { bumpCommentCount } from '@/lib/postCounts';
import { parseTimestamp } from '@/lib/time';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

export type ActionResult = { ok: true; id: string } | { ok: false; message: string };

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

type ThreadData = InfiniteData<CommentPage, CommentCursor | null>;

const byTime = (a: ThreadComment, b: ThreadComment) =>
  parseTimestamp(a.time) - parseTimestamp(b.time) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One comment thread (post or listing): published comments oldest first with
 * keyset paging, my own held (pending) comments, optimistic sends, edit and
 * delete, and live updates. Realtime payloads only signal; display data comes
 * from refetches (the payload has no nickname), except body/edited_at updates
 * of comments already shown.
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

  // Local only: rows being sent, rows the server returned but no refetch has brought yet, and optimistic deletes.
  const [sending, setSending] = useState<ThreadComment[]>([]);
  const [posted, setPosted] = useState<ThreadComment[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [newCount, setNewCount] = useState(0);

  const items = useMemo(() => {
    const byId = new Map<string, ThreadComment>();
    for (const page of thread.data?.pages ?? []) for (const c of page.items) byId.set(c.id, c);
    for (const c of pending.data ?? []) if (!byId.has(c.id)) byId.set(c.id, c);
    for (const c of posted) if (!byId.has(c.id)) byId.set(c.id, c);
    for (const c of sending) byId.set(c.id, c);
    return [...byId.values()].filter((c) => !hidden.has(c.id)).sort(byTime);
  }, [thread.data, pending.data, posted, sending, hidden]);

  const knownIds = useRef(new Set<string>());
  useEffect(() => {
    knownIds.current = new Set(items.map((c) => c.id));
  }, [items]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: threadKey }),
      queryClient.invalidateQueries({ queryKey: pendingKey }),
    ]);
  }, [queryClient, threadKey, pendingKey]);

  /** Marks both queries stale without refetching now: a reopened screen refetches, this one keeps the patched cache. */
  const markStale = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: threadKey, refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: pendingKey, refetchType: 'none' });
  }, [queryClient, threadKey, pendingKey]);

  /**
   * Writes a server row into the cache so a reopened screen shows it: published ->
   * replaced in place or appended to the last page (its stored nextCursor is kept, so
   * paging is unaffected and merge-by-id prevents duplicates); pending -> the pending list.
   * Falls back to local `posted` when the thread has not loaded yet.
   */
  const storeComment = useCallback(
    (item: ThreadComment) => {
      let stored = false;
      queryClient.setQueryData<ThreadData>(threadKey, (data) => {
        if (!data) return data;
        const without = data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== item.id) }));
        if (item.state !== 'published') return { ...data, pages: without };
        stored = true;
        const inPlace = data.pages.some((p) => p.items.some((c) => c.id === item.id));
        const pages = inPlace
          ? data.pages.map((p) => ({ ...p, items: p.items.map((c) => (c.id === item.id ? item : c)) }))
          : without.map((p, i) => (i === without.length - 1 ? { ...p, items: [...p.items, item] } : p));
        return { ...data, pages };
      });
      queryClient.setQueryData<ThreadComment[]>(pendingKey, (list) => {
        if (!list) return list;
        const without = list.filter((c) => c.id !== item.id);
        if (item.state !== 'pending') return without;
        stored = true;
        return [...without, item];
      });
      setPosted((list) => {
        const without = list.filter((c) => c.id !== item.id);
        return stored ? without : [...without, item];
      });
      markStale();
    },
    [queryClient, threadKey, pendingKey, markStale],
  );

  /** Removes a comment from every cache (after a delete). */
  const dropComment = useCallback(
    (id: string) => {
      queryClient.setQueryData<ThreadData>(threadKey, (data) =>
        data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== id) })) } : data,
      );
      queryClient.setQueryData<ThreadComment[]>(pendingKey, (list) => list?.filter((c) => c.id !== id));
      setPosted((list) => list.filter((c) => c.id !== id));
      markStale();
    },
    [queryClient, threadKey, pendingKey, markStale],
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

  const send = useCallback(
    async (body: string): Promise<ActionResult> => {
      if (!me) return { ok: false, message: getCommentErrorMessage(new Error('not_authenticated')) };
      const now = new Date().toISOString();
      const temp: ThreadComment = {
        id: `local-${randomUUID()}`,
        body,
        authorId: me.id,
        nickname: me.nickname,
        avatarKey: me.avatarKey,
        time: now,
        createdAt: now,
        editedAt: null,
        state: 'sending',
      };
      setSending((list) => [...list, temp]);
      try {
        const item = fromRow(await createComment(target, targetId, body), me);
        storeComment(item);
        if (item.state === 'published' && target === 'post') bumpCommentCount(queryClient, targetId, 1);
        if (item.state === 'pending') showToast('Sent for review');
        return { ok: true, id: item.id };
      } catch (error) {
        return { ok: false, message: getCommentErrorMessage(error) };
      } finally {
        setSending((list) => list.filter((c) => c.id !== temp.id));
      }
    },
    [me, target, targetId, queryClient, showToast, storeComment],
  );

  const edit = useCallback(
    async (comment: ThreadComment, body: string): Promise<ActionResult> => {
      if (!me) return { ok: false, message: getCommentErrorMessage(new Error('not_authenticated')) };
      try {
        const item = fromRow(await editOwnComment(comment.id, body), me);
        storeComment(item);
        if (comment.state === 'published' && item.state === 'pending' && target === 'post') {
          bumpCommentCount(queryClient, targetId, -1);
        }
        showToast(item.state === 'pending' ? 'Sent for review' : 'Saved');
        return { ok: true, id: item.id };
      } catch (error) {
        return { ok: false, message: getCommentErrorMessage(error) };
      }
    },
    [me, storeComment, target, targetId, queryClient, showToast],
  );

  const remove = useCallback(
    async (comment: ThreadComment): Promise<void> => {
      setHidden((set) => new Set(set).add(comment.id));
      try {
        await deleteOwnComment(comment.id);
        dropComment(comment.id);
        if (comment.state === 'published' && target === 'post') bumpCommentCount(queryClient, targetId, -1);
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
    [target, targetId, queryClient, showToast, dropComment],
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
      if (knownIds.current.has(row.id)) {
        // Body / edited_at of a comment already shown (nickname and avatar stay from the refetched row).
        if (event === 'UPDATE') {
          queryClient.setQueryData<InfiniteData<CommentPage, CommentCursor | null>>(threadKey, (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((p) => ({
                    ...p,
                    items: p.items.map((c) => (c.id === row.id ? { ...c, body: row.body, editedAt: row.edited_at } : c)),
                  })),
                }
              : data,
          );
        }
        return;
      }
      if (row.author_id === userId) return; // my own: already handled locally
      if (target === 'post') bumpCommentCount(queryClient, targetId, 1);
      if (isNearBottom()) void refetchAll().then(onAppended);
      else setNewCount((n) => n + 1);
    },
    // Back from background or a reconnect: events may have been missed.
    onResubscribed: () => void refetchAll(),
  });

  return {
    items,
    loading: thread.isPending && !thread.isError,
    error: thread.isError ? thread.error : null,
    retry: () => void thread.refetch(),
    hasMore: thread.hasNextPage,
    loadingMore: thread.isFetchingNextPage,
    loadMore: () => void thread.fetchNextPage(),
    newCount,
    showNew,
    send,
    edit,
    remove,
    myId: userId,
  };
}
