import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useMembership } from '@/hooks/useProfile';
import { type ParticipationAction, useSignInSheetStore } from '@/stores/signInSheetStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * Gate for every participation action (post, comment, react, vote, report, share).
 * Returns true only for a full member; otherwise opens the right prompt and returns false.
 * While the account is still loading (or failed to load) a toast explains why nothing happened.
 */
export function useRequireAuth() {
  const router = useRouter();
  const { status, retry } = useMembership();
  const openSheet = useSignInSheetStore((s) => s.open);
  const showToast = useToastStore((s) => s.show);

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
          showToast('Checking your account…');
          return false;
        case 'error':
          showToast('Could not load your account. Tap to retry.', retry);
          return false;
      }
    },
    [status, openSheet, router, showToast, retry],
  );
}
