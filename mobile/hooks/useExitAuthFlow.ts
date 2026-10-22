import { type Href, useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Leaves the auth screens. With no destination it returns to whatever tab the
 * user came from; with one (e.g. '/' after sign-up) it lands there instead.
 */
export function useExitAuthFlow(destination?: Href) {
  const router = useRouter();
  return useCallback(() => {
    const canDismiss = router.canDismiss();
    if (canDismiss) router.dismissAll();
    if (destination) router.navigate(destination);
    else if (!canDismiss) router.replace('/');
  }, [router, destination]);
}
