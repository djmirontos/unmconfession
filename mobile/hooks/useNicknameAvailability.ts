import { skipToken, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
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

export const SAME_NICKNAME = 'That is already your nickname.';

/**
 * Live feedback: local format check first, then a debounced server check.
 * `own` (change nickname): the member's current name, which the server would call taken;
 * the same name is "unchanged" and a change of capitals only is available.
 */
export function useNicknameAvailability(raw: string, own?: string | null): NicknameStatus {
  const debounced = useDebouncedValue(raw.trim(), 400);
  const parsed = nicknameSchema.safeParse(debounced);
  const isOwn = !!own && parsed.success && parsed.data.toLowerCase() === own.toLowerCase();
  const candidate = parsed.success && !isOwn ? parsed.data : null;

  const query = useQuery({
    queryKey: ['nickname-available', candidate?.toLowerCase() ?? ''],
    queryFn: candidate ? () => checkNicknameAvailable(candidate) : skipToken,
    staleTime: 15 * 1000,
    retry: false,
  });

  if (raw.trim() === '') return { state: 'idle' };
  if (raw.trim() !== debounced) return { state: 'checking' };
  if (!parsed.success) return { state: 'invalid', message: parsed.error.issues[0]?.message ?? 'Invalid nickname.' };
  if (isOwn) return parsed.data === own ? { state: 'invalid', message: SAME_NICKNAME } : { state: 'available' };
  if (query.isPending) return { state: 'checking' };
  if (query.isError) return { state: 'error' };
  return query.data ? { state: 'available' } : { state: 'unavailable' };
}
