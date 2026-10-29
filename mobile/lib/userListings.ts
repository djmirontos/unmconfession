import {
  type ListingCardData,
  LISTINGS_PAGE_SIZE,
  type ListingsCursor,
  type ListingsPage,
  toListingCard,
} from '@/lib/listings';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';

/**
 * Under ['listings', viewer], like the Buy & Sell lists, so updateListedListings (comment counts,
 * sold / returned, blocks), findListedListing and every ['listings'] invalidation cover it. Not persisted.
 */
export const userListingsKey = (authorId: string, viewerId: string | null) =>
  ['listings', viewerId ?? 'guest', { author: authorId }] as const;

/**
 * One member's published listings (Buy & Sell and Lost & Found, closed ones too), newest first,
 * keyset-paged on (published_at, id). feed_listings already hides authors I blocked.
 */
export async function fetchUserListingsPage(authorId: string, cursor: ListingsCursor | null): Promise<ListingsPage> {
  let query = supabase
    .from('feed_listings')
    .select('*')
    .eq('author_id', authorId)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LISTINGS_PAGE_SIZE);
  // Quoted: the timestamp holds characters that PostgREST's or() syntax reserves.
  if (cursor) query = query.or(`published_at.lt."${cursor.ts}",and(published_at.eq."${cursor.ts}",id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) {
    logError('userListings.page', error);
    throw error;
  }
  const items: ListingCardData[] = [];
  for (const row of data) {
    const card = toListingCard(row);
    if (card) items.push(card);
  }
  const last = items.at(-1);
  const nextCursor = data.length === LISTINGS_PAGE_SIZE && last ? { ts: last.time, id: last.id } : null;
  return { items, nextCursor };
}
