import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { mergePostCounts } from '@/lib/postCounts';
import { supabase } from '@/lib/supabase';

const INTERVAL_MS = 30 * 1000;

/** Every ~30 s while enabled, refreshes reaction/comment counts for the posts on screen. */
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
      const { data, error } = await supabase
        .from('feed_posts')
        .select('id, reaction_count, comment_count')
        .in('id', [...ids]);
      if (!error) mergePostCounts(queryClient, data);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, queryClient]);
}
