import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { usePostgresChanges } from '@/hooks/usePostgresChanges';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 50;

export type ThreadComment = {
  id: string;
  body: string;
  nickname: string | null;
  avatar_key: string | null;
  published_at: string;
};
type Cursor = { ts: string; id: string };
type Page = { items: ThreadComment[]; nextCursor: Cursor | null };

async function fetchComments(postId: string, cursor: Cursor | null): Promise<Page> {
  const { data, error } = await supabase.rpc('get_comments', {
    p_target_type: 'post',
    p_target_id: postId,
    p_after_ts: cursor?.ts,
    p_after_id: cursor?.id,
    p_limit: PAGE_SIZE,
  });
  if (error) throw error;
  const items: ThreadComment[] = [];
  for (const c of data) {
    if (c.id && c.body !== null && c.published_at) {
      items.push({ id: c.id, body: c.body, nickname: c.nickname, avatar_key: c.avatar_key, published_at: c.published_at });
    }
  }
  const last = items.at(-1);
  return { items, nextCursor: data.length === PAGE_SIZE && last ? { ts: last.published_at, id: last.id } : null };
}

/** Oldest-first thread with keyset paging. New comments arrive by refetch, never from the payload. */
export function useComments(postId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['comments', postId] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchComments(postId, pageParam),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  usePostgresChanges({
    table: 'comments',
    events: ['INSERT', 'UPDATE'],
    filter: `post_id=eq.${postId}`,
    enabled: postId !== '',
    onChange: (row) => {
      if (row.status !== 'published') return;
      void queryClient.invalidateQueries({ queryKey });
      // The post's comment_count changed too.
      void queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
    onResubscribed: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const comments = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((p) => p.items).filter((c) => !seen.has(c.id) && !!seen.add(c.id));
  }, [query.data]);

  return { query, comments };
}
