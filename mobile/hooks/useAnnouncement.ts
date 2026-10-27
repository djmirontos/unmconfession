import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useMinuteClock } from '@/hooks/useMinuteClock';
import { pickAnnouncement } from '@/lib/announcementPick';
import { supabase } from '@/lib/supabase';
import { parseTimestamp } from '@/lib/time';
import { useClosedAnnouncementsStore } from '@/stores/closedAnnouncementsStore';
import type { Tables } from '@/types/database';

export type Announcement = Pick<Tables<'announcements'>, 'id' | 'body' | 'starts_at' | 'ends_at' | 'created_at'>;

// Enough to find one not closed on this device behind a few closed ones.
const FETCH_LIMIT = 20;

async function fetchAnnouncements(): Promise<Announcement[]> {
  const nowIso = new Date().toISOString();
  // The title is a staff-only label; the app never reads it.
  const { data, error } = await supabase
    .from('announcements')
    .select('id, body, starts_at, ends_at, created_at')
    .lte('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('starts_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);
  if (error) throw error;
  return data;
}

function useAnnouncementsQuery() {
  return useQuery({
    queryKey: ['announcement'],
    queryFn: fetchAnnouncements,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The newest live announcement not closed on this device, or null (also while the closed list
 * is still being read). Filtered again on the device because staff can read every row.
 */
export function useAnnouncement() {
  const query = useAnnouncementsQuery();
  const closedIds = useClosedAnnouncementsStore((s) => s.closedIds);
  const load = useClosedAnnouncementsStore((s) => s.load);
  const close = useClosedAnnouncementsStore((s) => s.close);
  useEffect(load, [load]);
  // The shared minute clock (no network): one that ends while the feed is open goes away within a minute.
  const now = useMinuteClock(true) ?? 0;

  const announcement = closedIds === null ? null : pickAnnouncement(query.data ?? [], closedIds, now, parseTimestamp);
  return { announcement, close, query };
}
