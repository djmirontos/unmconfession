import { useEffect, useRef } from 'react';

import { useAppActive } from '@/hooks/useAppActive';
import { useForceUpdate } from '@/hooks/useAppRequirements';
import { useMembership } from '@/hooks/useProfile';
import { currentBuildType } from '@/lib/buildChannel';
import { installedVersion } from '@/lib/config';
import { fetchLatestAppInfo } from '@/lib/latestAppInfo';
import { resolveUpdateLink, shouldShowSoftUpdate, softUpdateMessage } from '@/lib/softUpdate';
import { useAuthStore } from '@/stores/authStore';
import { useCommentsSheetStore } from '@/stores/commentsSheetStore';
import { usePushPromptStore } from '@/stores/pushPromptStore';
import { useSignInSheetStore } from '@/stores/signInSheetStore';
import { useSoftUpdateStore } from '@/stores/softUpdateStore';

// Same pace as the hard gate's check (hooks/useAppRequirements.ts), with its own state.
const MIN_INTERVAL_MS = 5 * 60 * 1000;
const buildType = currentBuildType();

/**
 * The soft update reminder: fetched once the stored session is read and again on each return to
 * the foreground (at most every 5 minutes, counted per attempt). The last good answer is kept in
 * memory only; a failed fetch never shows anything new. Waits while the push explainer, the
 * sign-in sheet or the comments sheet is open, so they never stack.
 */
export function useSoftUpdate(): { visible: boolean; message: string; link: string | null; later: () => void } {
  const restored = useAuthStore((s) => s.restored);
  const appActive = useAppActive();
  const { status } = useMembership();
  const { required } = useForceUpdate();
  const laterTapped = useSoftUpdateStore((s) => s.laterTapped);
  const later = useSoftUpdateStore((s) => s.setLater);
  const explainerOpen = usePushPromptStore((s) => s.visible);
  const signInOpen = useSignInSheetStore((s) => s.isOpen);
  const commentsOpen = useCommentsSheetStore((s) => s.target !== null);
  const info = useSoftUpdateStore((s) => s.info);
  const setInfo = useSoftUpdateStore((s) => s.setInfo);
  const lastAttemptAt = useRef<number | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!restored || !appActive || inFlight.current) return;
    const now = Date.now();
    if (lastAttemptAt.current !== null && now - lastAttemptAt.current < MIN_INTERVAL_MS) return;
    lastAttemptAt.current = now;
    inFlight.current = true;
    void fetchLatestAppInfo()
      .then((next) => {
        if (next) setInfo(next);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [restored, appActive, setInfo]);

  const link = info ? resolveUpdateLink(buildType, info) : null;
  const show = shouldShowSoftUpdate({
    installed: installedVersion(),
    info,
    forceRequired: required,
    restored,
    membershipStatus: status,
    laterTapped,
    link,
  });
  return {
    visible: show && !explainerOpen && !signInOpen && !commentsOpen,
    message: info ? softUpdateMessage(info) : '',
    link,
    later,
  };
}
