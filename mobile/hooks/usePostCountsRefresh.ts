import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { logError } from '@/lib/log';
import { pollVoteTouchedSince } from '@/lib/pollVoteSync';
import { mergePostCounts } from '@/lib/postCounts';
import { supabase } from '@/lib/supabase';

const INTERVAL_MS = 30 * 1000;

/** Every ~30 s while enabled, refreshes reaction/comment counts and poll results (with my vote) for the posts on screen. */
export function usePostCountsRefresh(getVisibleIds: () => readonly string[], enabled: boolean): void {
  const queryClient = useQueryClient();
  const getIds = useRef(getVisibleIds);
  useEffect(() => {
    getIds.current = getVisibleIds;
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(async () => {
      const ids = getIds.current();
      if (ids.length === 0) return;
      const startedAt = Date.now();
      const { data, error } = await supabase
        .from('feed_posts')
        .select('id, reaction_count, comment_count, poll_options, my_vote')
        .in('id', [...ids]);
      if (error) logError('feed.counts', error, { ids: ids.length });
      else mergePostCounts(queryClient, data, (id) => pollVoteTouchedSince(id, startedAt));
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, queryClient]);
}
