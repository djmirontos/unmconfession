import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { parseTimestamp } from '@/lib/time';
import type { Tables } from '@/types/database';

export type Announcement = Pick<Tables<'announcements'>, 'id' | 'title' | 'body' | 'starts_at' | 'ends_at'>;

function isActive(a: Announcement, now: number): boolean {
  return parseTimestamp(a.starts_at) <= now && (a.ends_at === null || parseTimestamp(a.ends_at) > now);
}

async function fetchAnnouncements(): Promise<Announcement[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, starts_at, ends_at')
    .lte('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data;
}

/** The newest active announcement, or null. Filtered again on the device because staff can read every row. */
export function useAnnouncement(): Announcement | null {
  const query = useQuery({
    queryKey: ['announcement'],
    queryFn: fetchAnnouncements,
    staleTime: 5 * 60 * 1000,
  });
  const now = Date.now();
  return query.data?.find((a) => isActive(a, now)) ?? null;
}
