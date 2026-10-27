'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { type BackNavState, backFallback, hasPanelHistory, isMainDestination, observePop, startTracking } from '@/lib/back-nav';

const CanGoBack = createContext<() => boolean>(() => false);

/**
 * Tracks, in memory, whether the panel has its own history entries behind the current one
 * (see lib/back-nav.ts). Mounted in the panel layout, so it starts fresh on every full page
 * load and whenever the panel layout mounts again; no storage is needed.
 */
export function BackNavProvider({ children }: { children: ReactNode }) {
  const state = useRef<BackNavState | null>(null);

  useEffect(() => {
    state.current = startTracking(window.history.length);
    const onPop = () => {
      if (state.current) state.current = observePop(state.current, window.history.length);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const canGoBack = useCallback(() => state.current !== null && hasPanelHistory(state.current, window.history.length), []);
  return <CanGoBack value={canGoBack}>{children}</CanGoBack>;
}

/** Below lg: back to the previous panel page (its filters and URL intact), else to the parent list. */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const canGoBack = useContext(CanGoBack);
  if (isMainDestination(pathname)) return null;

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="size-11 lg:hidden"
      aria-label="Back"
      onClick={() => (canGoBack() ? router.back() : router.push(backFallback(pathname)))}
    >
      <ArrowLeft />
    </Button>
  );
}
