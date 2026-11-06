import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useChatEnabled } from '@/hooks/useChatEnabled';
import { useMembership } from '@/hooks/useProfile';
import { useSignInSheetStore } from '@/stores/signInSheetStore';

/**
 * Chat screens (/chat/*, chat privacy) are for members while chat is on. A guest who lands here
 * (deep link) goes Home with the sign-in prompt; anyone else, or chat switched off, goes Home.
 * Returns true once the screen may show.
 */
export function useChatScreenGuard(): boolean {
  const router = useRouter();
  const { status } = useMembership();
  const { enabled, known } = useChatEnabled();
  const leave = status === 'guest' || (known && !enabled);

  useEffect(() => {
    if (!leave) return;
    if (status === 'guest') useSignInSheetStore.getState().open('default');
    router.replace('/');
  }, [leave, status, router]);

  return enabled && !leave;
}
