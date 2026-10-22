import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useMembership } from '@/hooks/useProfile';
import { type ParticipationAction, useSignInSheetStore } from '@/stores/signInSheetStore';

/**
 * Gate for every participation action (post, comment, react, vote, report, share).
 * Returns true only for a full member; otherwise opens the right prompt and returns false.
 */
export function useRequireAuth() {
  const router = useRouter();
  const { status } = useMembership();
  const openSheet = useSignInSheetStore((s) => s.open);

  return useCallback(
    (action: ParticipationAction = 'default'): boolean => {
      switch (status) {
        case 'member':
          return true;
        case 'guest':
          openSheet(action);
          return false;
        case 'needs-nickname':
          router.push('/choose-nickname');
          return false;
        case 'loading':
          return false;
      }
    },
    [status, openSheet, router],
  );
}
