import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePostgresChanges } from '@/hooks/usePostgresChanges';
import { fetchFeedPage } from '@/lib/feed';
import type { FeedPost } from '@/lib/posts';
import { parseTimestamp } from '@/lib/time';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Listens to feed_events (one row each time a post becomes visible: published,
 * approved or restored) and collects post ids that are not loaded yet. Events
 * carry only a post id, so nothing is rendered from them: when isAtTop() says it
 * is safe, onMergeNow() refetches page 1; otherwise the id waits in pendingCount
 * (shown as the pill).
 */
export function useNewPosts(posts: readonly FeedPost[], isAtTop: () => boolean, onMergeNow: () => void) {
  const [pending, setPending] = useState<ReadonlySet<string>>(EMPTY);
  const pendingRef = useRef(pending);
  const loaded = useRef({ ids: new Set<string>(), newest: Number.NEGATIVE_INFINITY });
  const callbacks = useRef({ isAtTop, onMergeNow });
  useEffect(() => {
    callbacks.current = { isAtTop, onMergeNow };
    pendingRef.current = pending;
  });

  useEffect(() => {
    const ids = new Set(posts.map((p) => p.id));
    const first = posts[0];
    loaded.current = { ids, newest: first ? parseTimestamp(first.published_at) : Number.NEGATIVE_INFINITY };
  }, [posts]);

  // Ids that got loaded meanwhile (e.g. by pull to refresh) no longer count.
  const pendingCount = useMemo(() => {
    if (pending.size === 0) return 0;
    const ids = new Set(posts.map((p) => p.id));
    return [...pending].filter((id) => !ids.has(id)).length;
  }, [pending, posts]);

  const addNew = useCallback((ids: readonly string[]) => {
    const fresh = ids.filter((id) => !loaded.current.ids.has(id) && !pendingRef.current.has(id));
    if (fresh.length === 0) return;
    if (callbacks.current.isAtTop()) return callbacks.current.onMergeNow();
    setPending((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });
  }, []);

  /** Catch up on anything published while the channel was down. */
  const checkLatest = useCallback(async () => {
    const page = await fetchFeedPage(null);
    const { newest } = loaded.current;
    // Older posts missing from the cache (e.g. removed then restored) would not
    // appear at the top, so they must not raise the pill.
    addNew(page.items.filter((p) => parseTimestamp(p.published_at) >= newest).map((p) => p.id));
  }, [addNew]);

  usePostgresChanges({
    table: 'feed_events',
    events: ['INSERT'],
    onChange: (row) => addNew([row.post_id]),
    onResubscribed: () => void checkLatest().catch(() => undefined),
  });

  const clear = useCallback(() => setPending(EMPTY), []);

  return { pendingCount, clear };
}
