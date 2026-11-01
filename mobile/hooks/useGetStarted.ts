import { skipToken, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useMembership } from '@/hooks/useProfile';
import {
  GET_STARTED_COUNT_KEY,
  GET_STARTED_GOAL,
  type GetStartedCount,
  shouldShowGetStarted,
} from '@/lib/getStarted';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useGetStartedStore } from '@/stores/getStartedStore';

// How long "Nice, you're in!" stays before the card is marked completed and fades out.
const SUCCESS_MS = 4000;

/** My reactions on posts. RLS (reactions_own) only lets a member read their own rows; head: no rows are sent. */
async function fetchMyReactionCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('reactions')
    .select('post_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    logError('getStarted.count', error);
    throw error;
  }
  return count ?? 0;
}

export type GetStartedView = { phase: 'hidden' } | { phase: 'progress'; count: number } | { phase: 'done' };

/**
 * The Home "Get started" card. The count is only fetched while the card can still show; a reaction
 * confirmed in lib/reactionSync bumps it in place. Reaching the goal while the card was on screen
 * shows the success state, then marks it completed; reaching it unseen completes it silently, so
 * a later removed reaction never brings the card back.
 */
export function useGetStarted(): { view: GetStartedView; dismiss: () => void } {
  const { status, session } = useMembership();
  const userId = session?.user.id ?? null;
  const member = status === 'member' && userId !== null;
  const stored = useGetStartedStore((s) => (userId ? s.byUser[userId] : undefined)) ?? null;
  const load = useGetStartedStore((s) => s.load);
  const finish = useGetStartedStore((s) => s.finish);

  useEffect(() => {
    if (member) load(userId);
  }, [member, userId, load]);

  const query = useQuery({
    queryKey: [GET_STARTED_COUNT_KEY, userId ?? ''],
    queryFn: member && stored === 'none' ? () => fetchMyReactionCount(userId) : skipToken,
    staleTime: 60 * 1000,
  });
  const count: GetStartedCount =
    query.data !== undefined ? { state: 'ready', count: query.data } : query.isError ? { state: 'error' } : { state: 'loading' };

  const visible = shouldShowGetStarted({ membership: status, stored, count });
  const reached = member && stored === 'none' && count.state === 'ready' && count.count >= GET_STARTED_GOAL;

  // Adjusted while rendering (React's documented pattern), per user so another account starts fresh.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [celebratingFor, setCelebratingFor] = useState<string | null>(null);
  if (visible && userId && shownFor !== userId) setShownFor(userId);
  if (reached && userId && shownFor === userId && celebratingFor !== userId) setCelebratingFor(userId);

  // Reached without the card on screen (e.g. on first load): completed, nothing to celebrate.
  useEffect(() => {
    if (reached && userId && shownFor !== userId) finish(userId, 'completed');
  }, [reached, userId, shownFor, finish]);

  useEffect(() => {
    if (!celebratingFor) return;
    const timer = setTimeout(() => {
      // A dismissal during the success state stays a dismissal.
      if (useGetStartedStore.getState().byUser[celebratingFor] === 'none') finish(celebratingFor, 'completed');
      setCelebratingFor(null);
    }, SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [celebratingFor, finish]);

  const dismiss = useCallback(() => {
    if (userId) finish(userId, 'dismissed');
  }, [userId, finish]);

  let view: GetStartedView = { phase: 'hidden' };
  if (member && stored === 'none' && celebratingFor === userId) view = { phase: 'done' };
  else if (visible && count.state === 'ready') view = { phase: 'progress', count: count.count };
  return { view, dismiss };
}
