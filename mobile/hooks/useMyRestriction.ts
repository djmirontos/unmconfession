import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { noteSuspendedUntil, onSuspendedSeen } from '@/lib/warnings';
import { useAuthStore } from '@/stores/authStore';

async function fetchOwnSuspension(userId: string): Promise<string | null> {
  // RLS: a member reads only their own user_flags row.
  const { data, error } = await supabase.from('user_flags').select('status, suspended_until').eq('user_id', userId).single();
  if (error) {
    logError('restriction.read', { code: error.code });
    throw error;
  }
  return data.status === 'suspended' ? data.suspended_until : null;
}

/**
 * Mounted once at the root. Nothing is read until the app shows a "suspended" error; then the
 * member's own end time is read (and kept 5 minutes), so later messages say until when. A mute is
 * the existing timed suspension, so this covers both.
 */
export function useMyRestriction(): void {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const [wanted, setWanted] = useState(false);
  useEffect(() => onSuspendedSeen(() => setWanted(true)), []);
  const query = useQuery({
    queryKey: ['my-restriction', userId ?? ''],
    queryFn: wanted && userId ? () => fetchOwnSuspension(userId) : skipToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  useEffect(() => {
    if (query.data !== undefined) noteSuspendedUntil(query.data);
  }, [query.data]);
}
