import 'server-only';

import { applyAnnouncementFilters } from '@/lib/announcements/query';
import type { AnnouncementFilters } from '@/lib/announcements/schemas';
import { type AnnouncementStatus, announcementStatus, isoToManilaInput } from '@/lib/announcements/time';
import { codeFromError } from '@/lib/errors';
import { formatExact } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const LIST_LIMIT = 100;

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  /** Null for a deleted author (shown as "Deleted user"). */
  author: string | null;
  startsAt: string;
  startsExact: string;
  endsExact: string | null;
  /** Manila datetime-local values for the edit form. */
  startInput: string;
  endInput: string | null;
};

/** Newest first. RLS lets staff read every row (scheduled and ended too). */
export async function fetchAnnouncements(
  filters: AnnouncementFilters,
  now: number,
): Promise<{ rows: AnnouncementRow[]; limitHit: boolean }> {
  const supabase = await createClient();
  // The author's nickname through the created_by foreign key (profiles are readable by everyone).
  const base = supabase
    .from('announcements')
    .select('id, title, body, starts_at, ends_at, created_at, author:profiles!announcements_created_by_fkey(nickname)');
  const { data, error } = await applyAnnouncementFilters(base, filters, new Date(now).toISOString())
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT + 1);
  if (error) throw new Error(codeFromError(error));
  const list = data ?? [];
  return {
    limitHit: list.length > LIST_LIMIT,
    rows: list.slice(0, LIST_LIMIT).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      status: announcementStatus(r.starts_at, r.ends_at, now),
      author: r.author?.nickname ?? null,
      startsAt: r.starts_at,
      startsExact: formatExact(r.starts_at),
      endsExact: r.ends_at ? formatExact(r.ends_at) : null,
      startInput: isoToManilaInput(r.starts_at),
      endInput: r.ends_at ? isoToManilaInput(r.ends_at) : null,
    })),
  };
}
