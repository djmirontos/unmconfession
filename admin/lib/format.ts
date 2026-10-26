// Dates are shown in Manila time, the community's time zone.
const TIME_ZONE = 'Asia/Manila';

const exact = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, dateStyle: 'medium' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatExact(iso: string | null | undefined): string {
  return iso ? exact.format(new Date(iso)) : '—';
}

/** A "YYYY-MM-DD" date column (no time). */
export function formatDate(ymd: string | null | undefined): string {
  return ymd ? dateOnly.format(new Date(`${ymd}T12:00:00+08:00`)) : '—';
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 hours ago". Computed on the server so it matches between render and hydration. */
export function formatAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
