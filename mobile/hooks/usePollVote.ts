import { useCallback } from 'react';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { votePoll } from '@/lib/pollVoteSync';

/** Vote handler for a poll card. Guests get the sign-in sheet and nothing is sent (returns false). */
export function usePollVote(postId: string, myVote: string | null) {
  const requireAuth = useRequireAuth();
  return useCallback(
    (optionId: string): boolean => {
      if (!requireAuth('vote')) return false;
      if (optionId !== myVote) votePoll(postId, myVote, optionId);
      return true;
    },
    [requireAuth, postId, myVote],
  );
}
