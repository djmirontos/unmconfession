import type { ContentType, ReportTargetType } from '@/lib/review/schemas';

/** A pending or reported item (only what navigation needs); reported items can be profiles. */
export type QueueEntry = { target_type: ReportTargetType; target_id: string; created_at: string };

export const keyOf = (e: { target_type: string; target_id: string }) => `${e.target_type}:${e.target_id}`;

export function reviewHref(type: string, id: string, filter?: ContentType): string {
  return `/review/${type}/${id}${filter ? `?filter=${filter}` : ''}`;
}

export function listHref(filter?: ContentType): string {
  return filter ? `/review?filter=${filter}` : '/review';
}

const visible = (entries: readonly QueueEntry[], filter?: ReportTargetType) =>
  filter ? entries.filter((e) => e.target_type === filter) : entries;

/**
 * Previous and next pending item around the current one, oldest first. `window` is the head
 * of the queue; `after` is the queue strictly after the current item's created_at (exact
 * next even beyond the window). The current item may already be gone (handled meanwhile).
 */
export function neighbors(
  window: readonly QueueEntry[],
  after: readonly QueueEntry[],
  current: { key: string; createdAt: string },
  filter?: ContentType,
): { prev: QueueEntry | null; next: QueueEntry | null } {
  const head = visible(window, filter);
  const index = head.findIndex((e) => keyOf(e) === current.key);
  const prev =
    index > 0
      ? head[index - 1]
      : index === 0
        ? null
        : ([...head].reverse().find((e) => e.created_at < current.createdAt) ?? null);
  const next =
    visible(after, filter).find((e) => keyOf(e) !== current.key) ??
    (index >= 0 ? (head[index + 1] ?? null) : null);
  return { prev, next };
}

/**
 * Where to go after an action on the current item (or after "someone else already handled
 * it"): the next pending item after it; if it was the last one, the oldest item still
 * waiting; if nothing is left, null (back to the list).
 */
export function pickNextAfterAction(
  after: readonly QueueEntry[],
  head: readonly QueueEntry[],
  currentKey: string,
  filter?: ReportTargetType,
): QueueEntry | null {
  const notCurrent = (e: QueueEntry) => keyOf(e) !== currentKey;
  return visible(after, filter).find(notCurrent) ?? visible(head, filter).find(notCurrent) ?? null;
}

/** First ~200 characters as one plain line (newlines collapsed), cut at a word boundary. */
export function preview(body: string | null | undefined, max = 200): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
