import { z } from 'zod';

import { manilaInputToIso } from '@/lib/announcements/time';

// Mirrors the checks on public.announcements (the database re-checks every write).
export const TITLE_MAX = 100;
export const BODY_MAX = 1000;
export const MAX_AHEAD_MS = 365 * 24 * 3600 * 1000;

export const STATUSES = ['live', 'scheduled', 'ended'] as const;

/**
 * How the start is set: now, a Manila date-time, or (editing only) unchanged. "keep" is checked
 * against the stored start, which the server reads itself.
 */
const startSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('now') }),
  z.object({ mode: z.literal('schedule'), at: z.string() }),
  z.object({ mode: z.literal('keep') }),
]);

/** The form as sent: plain text title and body (line breaks kept), start, optional Manila end. created_by is never part of it. */
export const announcementFormSchema = z.object({
  title: z.string().trim().min(1, 'announcement_title_invalid').max(TITLE_MAX, 'announcement_title_invalid'),
  body: z.string().trim().min(1, 'announcement_body_invalid').max(BODY_MAX, 'announcement_body_invalid'),
  start: startSchema,
  end: z.string().nullable(),
});
export type AnnouncementForm = z.input<typeof announcementFormSchema>;

export const announcementIdSchema = z.uuid();
export const announcementUpdateSchema = announcementFormSchema.extend({ id: announcementIdSchema });

/** What gets written: UTC timestamps. */
export type AnnouncementValues = { title: string; body: string; startsAt: string; endsAt: string | null };

export type Checked = { ok: true; values: AnnouncementValues } | { ok: false; code: string };

const CODES = new Set([
  'announcement_title_invalid',
  'announcement_body_invalid',
  'announcement_date_invalid',
  'announcement_start_too_far',
  'announcement_end_before_start',
]);

/**
 * Validates the form and turns the Manila times into UTC. Shared by the dialog (live feedback)
 * and the Server Actions. `now` is the clock reading; `storedStart` is the current start (edits).
 */
export function checkAnnouncement(input: unknown, now: number, storedStart: string | null = null): Checked {
  const parsed = announcementFormSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '';
    return { ok: false, code: CODES.has(message) ? message : 'invalid_input' };
  }
  const { title, body, start, end } = parsed.data;

  let startsAt: string;
  if (start.mode === 'now') startsAt = new Date(now).toISOString();
  else if (start.mode === 'keep') {
    if (!storedStart) return { ok: false, code: 'invalid_input' };
    startsAt = storedStart;
  } else {
    const iso = manilaInputToIso(start.at);
    if (!iso) return { ok: false, code: 'announcement_date_invalid' };
    if (new Date(iso).getTime() > now + MAX_AHEAD_MS) return { ok: false, code: 'announcement_start_too_far' };
    startsAt = iso;
  }

  let endsAt: string | null = null;
  if (end !== null) {
    const iso = manilaInputToIso(end);
    if (!iso) return { ok: false, code: 'announcement_date_invalid' };
    if (new Date(iso).getTime() <= new Date(startsAt).getTime()) return { ok: false, code: 'announcement_end_before_start' };
    endsAt = iso;
  }
  return { ok: true, values: { title, body, startsAt, endsAt } };
}

// URL filter (a bad value falls back to "all").
export const announcementFiltersSchema = z.object({
  status: z.enum(STATUSES).optional().catch(undefined),
});
export type AnnouncementFilters = z.infer<typeof announcementFiltersSchema>;
