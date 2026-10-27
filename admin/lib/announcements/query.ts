// Pure builders for the announcements table: the status filter → query steps, and the rows written.

import type { AnnouncementFilters, AnnouncementValues } from '@/lib/announcements/schemas';

/** The subset of the Supabase query builder the list uses (so tests can record the calls). */
export interface AnnouncementQuery<Q> {
  lte(column: string, value: string): Q;
  gt(column: string, value: string): Q;
  or(filters: string): Q;
}

/** The status filter as time conditions, matching announcementStatus() and the read policy. */
export function applyAnnouncementFilters<Q extends AnnouncementQuery<Q>>(query: Q, filters: AnnouncementFilters, nowIso: string): Q {
  switch (filters.status) {
    case 'live':
      return query.lte('starts_at', nowIso).or(`ends_at.is.null,ends_at.gt.${nowIso}`);
    case 'scheduled':
      return query.gt('starts_at', nowIso);
    case 'ended':
      return query.lte('ends_at', nowIso);
    default:
      return query;
  }
}

export type AnnouncementWrite = { title: string; body: string; starts_at: string; ends_at: string | null };

/** The columns an edit may change. created_by (and the id) are never among them. */
export function announcementUpdateRow(values: AnnouncementValues): AnnouncementWrite {
  return { title: values.title, body: values.body, starts_at: values.startsAt, ends_at: values.endsAt };
}

/** A new row: the form's columns plus created_by from the validated session (never from the form). */
export function announcementInsertRow(values: AnnouncementValues, userId: string): AnnouncementWrite & { created_by: string } {
  return { ...announcementUpdateRow(values), created_by: userId };
}
