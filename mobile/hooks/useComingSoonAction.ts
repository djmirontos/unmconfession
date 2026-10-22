import { useCallback } from 'react';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToastStore } from '@/stores/toastStore';

export type PostAction = 'react' | 'comment' | 'vote' | 'share';

/** Guests get the sign-in sheet; members get "Coming soon" until these actions are built. */
export function useComingSoonAction() {
  const requireAuth = useRequireAuth();
  const show = useToastStore((s) => s.show);
  return useCallback(
    (action: PostAction) => {
      if (requireAuth(action)) show('Coming soon');
    },
    [requireAuth, show],
  );
}
