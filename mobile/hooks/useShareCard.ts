import { useCallback } from 'react';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { logError } from '@/lib/log';
import { isSharingAvailable, SHARE_FAILED, SHARE_UNAVAILABLE, type ShareItem, shareKey } from '@/lib/share';
import { useShareCardStore } from '@/stores/shareCardStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * share(item): sign-in check, then an image card of the item through the system share sheet.
 * Taps while a share is running are ignored. The card itself is rendered by <ShareCardHost/>.
 */
export function useShareCard() {
  const requireAuth = useRequireAuth();
  const showToast = useToastStore((s) => s.show);

  return useCallback(
    async (item: ShareItem) => {
      if (!requireAuth('share')) return;
      const { begin, render, finish } = useShareCardStore.getState();
      if (!begin(shareKey(item))) return;
      try {
        if (!(await isSharingAvailable())) {
          finish();
          showToast(SHARE_UNAVAILABLE);
          return;
        }
      } catch (e) {
        logError('share.available', e);
        finish();
        showToast(SHARE_FAILED);
        return;
      }
      render(item);
    },
    [requireAuth, showToast],
  );
}

/** True while this item's card is being made or its share sheet is open (spinner on its button). */
export function useIsSharing(key: string): boolean {
  return useShareCardStore((s) => s.busyKey === key);
}
