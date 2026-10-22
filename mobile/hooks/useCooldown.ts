import { useCallback, useEffect, useState } from 'react';

/** Countdown in whole seconds, e.g. for "Resend code in 42s". */
export function useCooldown(seconds: number, startActive = false) {
  const [endsAt, setEndsAt] = useState<number | null>(() =>
    startActive ? Date.now() + seconds * 1000 : null,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const start = useCallback(() => {
    setNow(Date.now());
    setEndsAt(Date.now() + seconds * 1000);
  }, [seconds]);

  return { remaining, start };
}
