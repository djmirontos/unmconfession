import { useCallback, useState } from 'react';

/** Fields the user has edited: inline errors show only for these. */
export function useTouched<K extends string>() {
  const [touched, setTouched] = useState<ReadonlySet<K>>(new Set());
  const touch = useCallback((key: K) => {
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  const reset = useCallback(() => setTouched(new Set()), []);
  return { isTouched: (key: K) => touched.has(key), touch, reset };
}
