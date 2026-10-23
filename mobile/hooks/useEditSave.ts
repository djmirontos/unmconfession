import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import type { EditResult } from '@/lib/ownItems';
import { useToastStore } from '@/stores/toastStore';

/**
 * Runs an edit RPC once (double taps ignored), toasts by the returned status
 * ("Sent for review" when the filter held it), updates caches, then goes back.
 */
export function useEditSave() {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async <T extends EditResult>(run: () => Promise<T>, after: (result: T) => void) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSaving(true);
      setError(null);
      try {
        const result = await run();
        after(result);
        showToast(result.published ? 'Saved' : 'Sent for review');
        if (router.canGoBack()) router.back();
        else router.replace('/my-posts');
      } catch (e) {
        logError('edit.save', e);
        setError(getErrorMessage(e));
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [router, showToast],
  );

  return { save, saving, error };
}
