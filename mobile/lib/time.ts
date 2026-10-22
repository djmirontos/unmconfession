const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Parses a Postgres timestamp from PostgREST or Realtime. Realtime can omit the
 * UTC offset and send microseconds, which Date.parse would read as local time.
 */
export function parseTimestamp(value: string): number {
  let s = value.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  return Date.parse(s);
}

/** "now", "5m", "3h", "2d", then a short date ("Oct 3" or "Oct 3, 2025"). */
export function formatRelative(value: string, now = Date.now()): string {
  const ts = parseTimestamp(value);
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "Ends in 3d" / "Ends in 5h" / "Ends in 12m" / "Ended". */
export function formatPollEnd(endsAt: string, now = Date.now()): { ended: boolean; label: string } {
  const left = parseTimestamp(endsAt) - now;
  if (left <= 0) return { ended: true, label: 'Ended' };
  if (left >= DAY) return { ended: false, label: `Ends in ${Math.floor(left / DAY)}d` };
  if (left >= HOUR) return { ended: false, label: `Ends in ${Math.floor(left / HOUR)}h` };
  return { ended: false, label: `Ends in ${Math.max(1, Math.floor(left / MINUTE))}m` };
}
