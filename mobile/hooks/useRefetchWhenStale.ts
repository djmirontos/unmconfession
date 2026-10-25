import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useAppActive } from '@/hooks/useAppActive';

type Refetchable = { isStale: boolean; refetch: () => Promise<unknown> };

/**
 * Refetches a list when it comes into view (tab focus, segment switch) or the app
 * returns from the background, but only while its data is stale.
 * `active` is false while another segment is shown.
 */
export function useRefetchWhenStale({ isStale, refetch }: Refetchable, active: boolean): void {
  const appActive = useAppActive();
  const isFocused = useIsFocused();

  const refreshIfStale = useCallback(() => {
    if (isStale) void refetch();
  }, [isStale, refetch]);

  useFocusEffect(
    useCallback(() => {
      if (active) refreshIfStale();
    }, [active, refreshIfStale]),
  );

  const wasActive = useRef(appActive);
  useEffect(() => {
    if (appActive && !wasActive.current && active && isFocused) refreshIfStale();
    wasActive.current = appActive;
  }, [appActive, active, isFocused, refreshIfStale]);
}
