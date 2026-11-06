import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getErrorMessage } from '@/lib/errors';
import { announceHold } from '@/lib/holdNotice';
import type { HoldTarget } from '@/lib/holdReason';
import { logError } from '@/lib/log';
import type { EditResult } from '@/lib/ownItems';
import { useToastStore } from '@/stores/toastStore';

/**
 * Runs an edit RPC once (double taps ignored), toasts by the returned status
 * ("Sent for review", or the keyword line when the word filter held it: pass `held`, the item
 * being edited), updates caches, then goes back.
 */
export function useEditSave() {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async <T extends EditResult>(run: () => Promise<T>, after: (result: T) => void, held?: { type: HoldTarget; id: string }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSaving(true);
      setError(null);
      try {
        const result = await run();
        after(result);
        if (result.published) showToast('Saved');
        else if (held) announceHold(held.type, held.id, 'Sent for review');
        else showToast('Sent for review');
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
