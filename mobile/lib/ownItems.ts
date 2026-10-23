import type { QueryClient } from '@tanstack/react-query';

import type { Condition } from '@/lib/createSchemas';
import type { FeedData } from '@/lib/feed';
import { logError, logInfo } from '@/lib/log';
import type { MyItem } from '@/lib/myPosts';
import type { FeedPost } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { parseTimestamp } from '@/lib/time';

// Mirrors edit_own_post / edit_own_listing: the server is the authority.
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type EditCheck = Pick<MyItem, 'status' | 'kind' | 'createdAt'>;

/** Milliseconds left to edit (device time; the server re-checks). Zero or less = closed. */
export function editTimeLeftMs(createdAt: string, now = Date.now()): number {
  return parseTimestamp(createdAt) + EDIT_WINDOW_MS - now;
}

/** Published or pending, not a poll, and posted less than 24 hours ago. */
export function canEdit(item: EditCheck, now = Date.now()): boolean {
  return (
    (item.status === 'published' || item.status === 'pending') &&
    item.kind !== 'poll' &&
    editTimeLeftMs(item.createdAt, now) > 0
  );
}

/** "5 h 20 min left" / "12 min left" / "less than 1 min left". */
export function formatTimeLeft(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'less than 1 min left';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

export type EditResult = { published: boolean };

export async function editOwnPost(id: string, body: string, targetName: string | null): Promise<EditResult & {
  body: string;
  targetName: string | null;
  editedAt: string | null;
}> {
  const { data, error } = await supabase.rpc('edit_own_post', {
    p_post_id: id,
    p_body: body,
    p_target_name: targetName ?? undefined,
  });
  if (error) {
    logError('rpc.edit_own_post', error, { id });
    throw error;
  }
  logInfo('rpc.edit_own_post', 'ok', { status: data.status });
  return { published: data.status === 'published', body: data.body, targetName: data.target_name, editedAt: data.edited_at };
}

export type ListingEdit = {
  title: string;
  description: string;
  price?: number;
  condition?: Condition;
  location?: string;
  eventDate?: string;
};

export async function editOwnListing(id: string, edit: ListingEdit): Promise<EditResult> {
  const { data, error } = await supabase.rpc('edit_own_listing', {
    p_listing_id: id,
    p_title: edit.title,
    p_description: edit.description || undefined,
    p_price: edit.price,
    p_condition: edit.condition,
    p_location: edit.location,
    p_event_date: edit.eventDate,
  });
  if (error) {
    logError('rpc.edit_own_listing', error, { id });
    throw error;
  }
  logInfo('rpc.edit_own_listing', 'ok', { status: data.status });
  return { published: data.status === 'published' };
}

export async function deleteOwnItem(source: MyItem['source'], id: string): Promise<void> {
  const { error } =
    source === 'post'
      ? await supabase.rpc('delete_own_post', { p_post_id: id })
      : await supabase.rpc('delete_own_listing', { p_listing_id: id });
  if (error) {
    logError(`rpc.delete_own_${source}`, error, { id });
    throw error;
  }
  logInfo(`rpc.delete_own_${source}`, 'ok');
}

function updateFeed(queryClient: QueryClient, id: string, change: (post: FeedPost) => FeedPost | null) {
  queryClient.setQueriesData<FeedData>({ queryKey: ['feed'] }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.flatMap((p) => {
          if (p.id !== id) return [p];
          const next = change(p);
          return next ? [next] : [];
        }),
      })),
    };
  });
}

/** Refreshes only what an own-item change touches: My Posts, the item, its detail, and Trending. */
function invalidateOwnItem(queryClient: QueryClient, source: MyItem['source'], id: string) {
  void queryClient.invalidateQueries({ queryKey: ['my-posts'] });
  void queryClient.invalidateQueries({ queryKey: ['my-item'] });
  if (source === 'post') {
    void queryClient.invalidateQueries({ queryKey: ['post', id] });
    void queryClient.invalidateQueries({ queryKey: ['trending'] });
  }
}

/** After an edit: patch the post in the cached feed (or drop it if held for review), then invalidate. */
export function afterPostEdit(
  queryClient: QueryClient,
  id: string,
  result: { published: boolean; body: string; targetName: string | null; editedAt: string | null },
) {
  updateFeed(queryClient, id, (p) =>
    result.published ? { ...p, body: result.body, target_name: result.targetName, edited_at: result.editedAt } : null,
  );
  invalidateOwnItem(queryClient, 'post', id);
}

export function afterListingEdit(queryClient: QueryClient, id: string) {
  invalidateOwnItem(queryClient, 'listing', id);
}

/** After a delete: drop it from the cached feed right away, then invalidate. */
export function afterDelete(queryClient: QueryClient, source: MyItem['source'], id: string) {
  if (source === 'post') updateFeed(queryClient, id, () => null);
  invalidateOwnItem(queryClient, source, id);
}
