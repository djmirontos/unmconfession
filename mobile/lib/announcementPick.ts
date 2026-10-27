// Pure announcement logic (no React Native imports, so tests/announcements.test.mjs runs it in Node).

export type PickableAnnouncement = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

/** Ids closed on this device, newest last. */
export const CLOSED_MAX = 200;

/** Live right now: started and not yet ended. The server filters too; this catches one that ended while the app was open. */
function isLive(a: PickableAnnouncement, now: number, parse: (s: string) => number): boolean {
  return parse(a.starts_at) <= now && (a.ends_at === null || parse(a.ends_at) > now);
}

/**
 * The newest live announcement not closed on this device (starts_at, then created_at, newest
 * first), or null. `parse` reads a timestamp; the app passes lib/time's parseTimestamp.
 */
export function pickAnnouncement<T extends PickableAnnouncement>(
  list: readonly T[],
  closedIds: readonly string[],
  now: number,
  parse: (s: string) => number = Date.parse,
): T | null {
  const closed = new Set(closedIds);
  const candidates = list.filter((a) => !closed.has(a.id) && isLive(a, now, parse));
  candidates.sort((a, b) => parse(b.starts_at) - parse(a.starts_at) || parse(b.created_at) - parse(a.created_at));
  return candidates[0] ?? null;
}

/** Adds an id (moved to the end if already there), keeping the newest CLOSED_MAX. */
export function addClosedId(list: readonly string[], id: string): string[] {
  return [...list.filter((x) => x !== id), id].slice(-CLOSED_MAX);
}

/** The stored list; anything missing or malformed is an empty list, non-string items are dropped. */
export function parseClosedIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((x): x is string => typeof x === 'string').slice(-CLOSED_MAX);
  } catch {
    return [];
  }
}
