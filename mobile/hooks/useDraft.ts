import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

type DraftValues = Record<string, string | number | string[]>;

const SAVE_DELAY_MS = 500;
const storageKey = (userId: string, form: string) => `unm-draft:${userId}:${form}`;

/** Keeps only keys of `initial` whose stored value has the same type (drafts outlive app versions). */
function restore<T extends DraftValues>(initial: T, raw: string | null): T {
  if (!raw) return initial;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return initial;
    const out: DraftValues = { ...initial };
    for (const key of Object.keys(initial)) {
      const stored = (parsed as Record<string, unknown>)[key];
      const expected = initial[key];
      if (Array.isArray(expected)) {
        if (Array.isArray(stored) && stored.every((s) => typeof s === 'string')) out[key] = stored;
      } else if (typeof stored === typeof expected) {
        out[key] = stored as string | number;
      }
    }
    return out as T;
  } catch {
    return initial;
  }
}

/**
 * Form text kept in AsyncStorage per user and form, restored once on mount.
 * Writes are debounced. Images are never part of a draft.
 */
export function useDraft<T extends DraftValues>(userId: string, form: string, initial: T) {
  const [values, setValues] = useState<T>(initial);
  const initialRef = useRef(initial);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loaded.current = false;
    void AsyncStorage.getItem(storageKey(userId, form)).then((raw) => {
      if (cancelled) return;
      // Only restore if the user has not started typing meanwhile.
      setValues((current) => (current === initialRef.current ? restore(initialRef.current, raw) : current));
      loaded.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [userId, form]);

  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(storageKey(userId, form), JSON.stringify(values));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, userId, form]);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  const clear = useCallback(() => {
    setValues(initialRef.current);
    void AsyncStorage.removeItem(storageKey(userId, form));
  }, [userId, form]);

  return { values, set, clear };
}
