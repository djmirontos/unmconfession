import type { KeysetCursor } from '@/lib/moderation/schemas';

// Keyset paging over the (created_at, id) ordered RPCs. Pure, so tests can use it.

export type Page<Row> = { rows: Row[]; nextCursor: KeysetCursor | null };

/** A full page means there may be more: the next cursor is the last raw row's (timestamp, id). */
export function keysetPage<R, Row>(data: R[], toRow: (r: R) => Row, cursorOf: (r: R) => KeysetCursor, limit: number): Page<Row> {
  const last = data[data.length - 1];
  return { rows: data.map(toRow), nextCursor: data.length === limit && last ? cursorOf(last) : null };
}

/** The RPC arguments for "after this cursor" (none on the first page). */
export const afterArgs = (cursor?: KeysetCursor) => (cursor ? { p_after_ts: cursor.ts, p_after_id: cursor.id } : {});
