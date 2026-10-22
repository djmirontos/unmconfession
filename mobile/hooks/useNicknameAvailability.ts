import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { nicknameSchema } from '@/lib/validation';

export type NicknameStatus =
  | { state: 'idle' }
  | { state: 'invalid'; message: string }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'unavailable' }
  | { state: 'error' };

export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_nickname_available', { p_nickname: nickname });
  if (error) throw error;
  return data;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Live feedback: local format check first, then a debounced server check. */
export function useNicknameAvailability(raw: string): NicknameStatus {
  const debounced = useDebouncedValue(raw.trim(), 400);
  const parsed = nicknameSchema.safeParse(debounced);
  const candidate = parsed.success ? parsed.data : null;

  const query = useQuery({
    queryKey: ['nickname-available', candidate?.toLowerCase() ?? ''],
    queryFn: candidate ? () => checkNicknameAvailable(candidate) : skipToken,
    staleTime: 15 * 1000,
    retry: false,
  });

  if (raw.trim() === '') return { state: 'idle' };
  if (raw.trim() !== debounced) return { state: 'checking' };
  if (!parsed.success) return { state: 'invalid', message: parsed.error.issues[0]?.message ?? 'Invalid nickname.' };
  if (query.isPending) return { state: 'checking' };
  if (query.isError) return { state: 'error' };
  return query.data ? { state: 'available' } : { state: 'unavailable' };
}
