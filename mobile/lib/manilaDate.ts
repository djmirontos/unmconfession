// Lost & Found dates are judged in Manila time (UTC+8, no DST), like create_listing.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Oldest event date the server accepts, in days before Manila today. */
export const LOST_FOUND_MAX_AGE_DAYS = 60;

/** Today's date in Manila as YYYY-MM-DD, whatever the device time zone. */
export function manilaToday(now = Date.now()): string {
  return new Date(now + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function parts(ymd: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = ymd.split('-').map(Number);
  return [y, m, d];
}

/** Calendar arithmetic on YYYY-MM-DD, done in UTC so no time zone is involved. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD as a local Date at noon, so the picker and formatters show that same day in any zone. */
export function ymdToLocalNoon(ymd: string): Date {
  const [y, m, d] = parts(ymd);
  return new Date(y, m - 1, d, 12);
}

/** A picked Date back to YYYY-MM-DD from its LOCAL components (never toISOString, which may shift the day). */
export function localDateToYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Oct 5" */
export function formatShortDate(ymd: string): string {
  return ymdToLocalNoon(ymd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Accepted range for a Lost & Found date: [today - 60 days, today], Manila time. */
export function lostFoundDateRange(now = Date.now()): { min: string; max: string } {
  const max = manilaToday(now);
  return { min: addDays(max, -LOST_FOUND_MAX_AGE_DAYS), max };
}

/** Event date as "Oct 9", or "Oct 9, 2025" when not this (Manila) year. Built from the Y-M-D parts. */
export function formatEventDate(ymd: string, now = Date.now()): string {
  const sameYear = ymd.slice(0, 4) === manilaToday(now).slice(0, 4);
  return ymdToLocalNoon(ymd).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
