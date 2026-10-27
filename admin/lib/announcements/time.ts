// Announcement times: the form's <input type="datetime-local"> value is Manila wall-clock time.
// The Philippines has no daylight saving, so Manila is always UTC+08:00.

const OFFSET_MS = 8 * 3600 * 1000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-27T09:30" (Manila) -> "2026-10-27T01:30:00.000Z"; null if it is not a real date and time. */
export function manilaInputToIso(value: string): string | null {
  const m = LOCAL.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MS;
  // Rejects days that roll over (31 April, 29 February outside leap years).
  return isoToManilaInput(new Date(ms).toISOString()) === value ? new Date(ms).toISOString() : null;
}

/** A stored timestamp as the Manila value a datetime-local input expects ("YYYY-MM-DDTHH:mm"). */
export function isoToManilaInput(iso: string): string {
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

export type AnnouncementStatus = 'scheduled' | 'live' | 'ended';

/** Same rule as the announcements_read policy: live while starts_at <= now < ends_at (or no end). */
export function announcementStatus(startsAt: string, endsAt: string | null, now: number): AnnouncementStatus {
  if (new Date(startsAt).getTime() > now) return 'scheduled';
  if (endsAt !== null && new Date(endsAt).getTime() <= now) return 'ended';
  return 'live';
}

export const STATUS_LABELS: Record<AnnouncementStatus, string> = { scheduled: 'Scheduled', live: 'Live', ended: 'Ended' };

export type AnnouncementAction = 'edit' | 'end' | 'delete';

/** "End now" only for a live announcement; edit and delete for any. */
export function announcementActions(status: AnnouncementStatus): AnnouncementAction[] {
  return status === 'live' ? ['edit', 'end', 'delete'] : ['edit', 'delete'];
}
