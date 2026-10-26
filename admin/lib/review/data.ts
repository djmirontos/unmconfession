import 'server-only';

import { serverEnv } from '@/lib/env';
import { codeFromError } from '@/lib/errors';
import { formatAgo, formatExact } from '@/lib/format';
import { imageCount, parseImages, type ReviewImage } from '@/lib/review/content';
import { keyOf, neighbors, pickNextAfterAction, preview, type QueueEntry } from '@/lib/review/queue';
import type { ContentType } from '@/lib/review/schemas';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export const QUEUE_PAGE = 50;
// Head of the queue used for "previous" and the wrap-around after the last item.
const WINDOW = 100;

type QueueRpcRow = Database['public']['Functions']['mod_get_queue']['Returns'][number];
export type ContentRow = Database['public']['Functions']['mod_get_content']['Returns'][number];

export type QueueRow = {
  key: string;
  type: ContentType;
  id: string;
  createdAt: string;
  kind: string | null;
  nickname: string | null;
  ago: string;
  exact: string;
  preview: string;
  images: number;
  holdReason: string | null;
  matchedTerm: string | null;
};

function toRow(r: QueueRpcRow): QueueRow {
  return {
    key: keyOf(r),
    type: r.target_type,
    id: r.target_id,
    createdAt: r.created_at,
    kind: r.title,
    nickname: r.nickname,
    ago: formatAgo(r.created_at),
    exact: formatExact(r.created_at),
    preview: preview(r.body),
    images: imageCount(r.images),
    holdReason: r.hold_reason,
    matchedTerm: r.matched_term,
  };
}

async function queueRpc(limit: number, after?: string): Promise<QueueRpcRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_queue', { p_limit: limit, ...(after ? { p_after_ts: after } : {}) });
  if (error) throw new Error(codeFromError(error));
  return data ?? [];
}

const entry = (r: QueueRpcRow): QueueEntry => ({ target_type: r.target_type, target_id: r.target_id, created_at: r.created_at });

/** One page of the queue, oldest first. `after` is the last row's created_at, passed back unchanged. */
export async function fetchQueuePage(after?: string): Promise<{ rows: QueueRow[]; nextCursor: string | null }> {
  const data = await queueRpc(QUEUE_PAGE, after);
  return {
    rows: data.map(toRow),
    nextCursor: data.length === QUEUE_PAGE ? data[data.length - 1].created_at : null,
  };
}

/** The full item, or null when it does not exist. Other errors are thrown for the error boundary. */
export async function fetchContent(type: ContentType, id: string): Promise<ContentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_content', { p_type: type, p_id: id });
  if (error) {
    const code = codeFromError(error);
    if (code === 'not_found') return null;
    throw new Error(code);
  }
  return data?.[0] ?? null;
}

/** "Comment on post #12": the parent's number, or null if it cannot be read. */
export async function fetchParentPostNumber(postId: string): Promise<number | null> {
  const parent = await fetchContent('post', postId).catch(() => null);
  return parent?.post_number ?? null;
}

export async function fetchNeighbors(current: { type: ContentType; id: string; createdAt: string }, filter?: ContentType) {
  const [window, after] = await Promise.all([queueRpc(WINDOW), queueRpc(WINDOW, current.createdAt)]);
  return neighbors(window.map(entry), after.map(entry), { key: keyOf({ target_type: current.type, target_id: current.id }), createdAt: current.createdAt }, filter);
}

export async function fetchNextAfterAction(currentKey: string, after: string | undefined, filter?: ContentType) {
  const [afterRows, head] = await Promise.all([after ? queueRpc(WINDOW, after) : Promise.resolve([]), queueRpc(WINDOW)]);
  return pickNextAfterAction(afterRows.map(entry), head.map(entry), currentKey, filter);
}

export function contentImages(row: Pick<ContentRow, 'images'>): ReviewImage[] {
  return parseImages(row.images, serverEnv().url);
}
