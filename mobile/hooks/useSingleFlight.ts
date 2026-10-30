import { useCallback, useRef, useState } from 'react';

import { useToastStore } from '@/stores/toastStore';

/**
 * One request at a time (a ref also blocks a fast double tap before the state re-renders).
 * `run(call, success)` shows the success toast, or keeps the mapped error for an inline message.
 */
export function useSingleFlight(errorText: (error: unknown) => string) {
  const showToast = useToastStore((s) => s.show);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    (call: () => Promise<unknown>, success?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      call()
        .then(() => {
          if (success) showToast(success);
        })
        .catch((e: unknown) => setError(errorText(e)))
        .finally(() => {
          inFlight.current = false;
        });
    },
    [errorText, showToast],
  );

  return { run, error };
}
