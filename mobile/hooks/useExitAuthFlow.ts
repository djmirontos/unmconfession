import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/** Leaves the auth screens and returns to whatever tab the user came from. */
export function useExitAuthFlow() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  }, [router]);
}
