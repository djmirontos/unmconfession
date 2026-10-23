import { LOST_FOUND_TYPES, type LostFoundType } from '@/lib/createSchemas';
import { parseImages, type PostImage } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { parseTimestamp } from '@/lib/time';
import type { Database, Tables } from '@/types/database';

type Enums = Database['public']['Enums'];
export type ContentStatus = Enums['content_status'];

export type MyItem = {
  source: 'post' | 'listing';
  id: string;
  kind: Enums['post_kind'] | Enums['listing_kind'];
  /** Post body or listing title. */
  text: string;
  number: number | null;
  status: ContentStatus;
  rejectReason: string | null;
  createdAt: string;
  images: PostImage[];
  /** Shoutouts only. */
  targetName: string | null;
  // Listings only.
  description: string | null;
  price: number | null;
  condition: string | null;
  location: string | null;
  /** YYYY-MM-DD (Lost & Found). */
  eventDate: string | null;
  /** Lost & Found only; null for anything else. */
  lostFoundType: LostFoundType | null;
};

type Cursor = { ts: string; id: string };
type SourceState = { cursor: Cursor | null; done: boolean };
export type MyPostsCursor = { post: SourceState; listing: SourceState };
export type MyPostsPage = { items: MyItem[]; next: MyPostsCursor | null };

const PAGE_SIZE = 20;
export const MY_POSTS_START: MyPostsCursor = {
  post: { cursor: null, done: false },
  listing: { cursor: null, done: false },
};

const POST_COLUMNS = 'id, kind, body, number, status, reject_reason, created_at, target_name, images';
const LISTING_COLUMNS =
  'id, kind, title, status, reject_reason, created_at, images, description, price, condition, location, event_date, lost_found_type';

type PostRow = Pick<
  Tables<'posts'>,
  'id' | 'kind' | 'body' | 'number' | 'status' | 'reject_reason' | 'created_at' | 'target_name' | 'images'
>;
type ListingRow = Pick<
  Tables<'listings'>,
  | 'id' | 'kind' | 'title' | 'status' | 'reject_reason' | 'created_at' | 'images'
  | 'description' | 'price' | 'condition' | 'location' | 'event_date' | 'lost_found_type'
>;

const toPostItem = (r: PostRow): MyItem => ({
  source: 'post',
  id: r.id,
  kind: r.kind,
  text: r.body,
  number: r.number,
  status: r.status,
  rejectReason: r.reject_reason,
  createdAt: r.created_at,
  images: parseImages(r.images),
  targetName: r.target_name,
  description: null,
  price: null,
  condition: null,
  location: null,
  eventDate: null,
  lostFoundType: null,
});

const toListingItem = (r: ListingRow): MyItem => ({
  source: 'listing',
  id: r.id,
  kind: r.kind,
  text: r.title,
  number: null,
  status: r.status,
  rejectReason: r.reject_reason,
  createdAt: r.created_at,
  images: parseImages(r.images),
  targetName: null,
  description: r.description,
  price: r.price,
  condition: r.condition,
  location: r.location,
  eventDate: r.event_date,
  lostFoundType: LOST_FOUND_TYPES.find((t) => t === r.lost_found_type) ?? null,
});

/** Keyset "older than cursor" on (created_at, id), newest first. */
function olderThan(cursor: Cursor): string {
  return `created_at.lt."${cursor.ts}",and(created_at.eq."${cursor.ts}",id.lt.${cursor.id})`;
}

async function fetchPosts(userId: string, cursor: Cursor | null): Promise<MyItem[]> {
  let q = supabase.from('posts').select(POST_COLUMNS).eq('author_id', userId);
  if (cursor) q = q.or(olderThan(cursor));
  const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
  if (error) throw error;
  return data.map(toPostItem);
}

async function fetchListings(userId: string, cursor: Cursor | null): Promise<MyItem[]> {
  let q = supabase.from('listings').select(LISTING_COLUMNS).eq('author_id', userId);
  if (cursor) q = q.or(olderThan(cursor));
  const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
  if (error) throw error;
  return data.map(toListingItem);
}

/**
 * One of the user's own posts or listings in any status. RLS lets authors read
 * their own rows; null when it does not exist or is not theirs.
 */
export async function fetchMyItem(userId: string, source: MyItem['source'], id: string): Promise<MyItem | null> {
  if (source === 'post') {
    const { data, error } = await supabase.from('posts').select(POST_COLUMNS).eq('id', id).eq('author_id', userId).maybeSingle();
    if (error) throw error;
    return data ? toPostItem(data) : null;
  }
  const { data, error } = await supabase.from('listings').select(LISTING_COLUMNS).eq('id', id).eq('author_id', userId).maybeSingle();
  if (error) throw error;
  return data ? toListingItem(data) : null;
}

/** Newest first; ties by id, like the SQL ORDER BY. */
function compare(a: Cursor, b: Cursor): number {
  const diff = parseTimestamp(b.ts) - parseTimestamp(a.ts);
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

const toCursor = (item: MyItem): Cursor => ({ ts: item.createdAt, id: item.id });

/**
 * Merges one fetched batch of posts and listings by created_at. A source that
 * returned a full page may have older rows not fetched yet, so only items at or
 * above the newest of those sources' last rows are emitted; the rest are
 * refetched next time from the advanced cursors.
 */
export function mergeMyPostsPage(posts: MyItem[], listings: MyItem[], state: MyPostsCursor, pageSize = PAGE_SIZE): MyPostsPage {
  const fullLasts = [posts, listings]
    .filter((rows) => rows.length === pageSize)
    .map((rows) => toCursor(rows[rows.length - 1] as MyItem));
  const cutoff = fullLasts.sort(compare)[0] ?? null;

  const merged = [...posts, ...listings].sort((a, b) => compare(toCursor(a), toCursor(b)));
  const items = cutoff ? merged.filter((item) => compare(toCursor(item), cutoff) <= 0) : merged;

  const advance = (source: MyItem['source'], rows: MyItem[], prev: SourceState): SourceState => {
    if (prev.done) return prev;
    const emitted = items.filter((i) => i.source === source);
    const last = emitted.at(-1);
    const done = rows.length < pageSize && emitted.length === rows.length;
    return { cursor: last ? toCursor(last) : prev.cursor, done };
  };
  const next = { post: advance('post', posts, state.post), listing: advance('listing', listings, state.listing) };
  return { items, next: next.post.done && next.listing.done ? null : next };
}

export async function fetchMyPostsPage(userId: string, state: MyPostsCursor): Promise<MyPostsPage> {
  const [posts, listings] = await Promise.all([
    state.post.done ? [] : fetchPosts(userId, state.post.cursor),
    state.listing.done ? [] : fetchListings(userId, state.listing.cursor),
  ]);
  return mergeMyPostsPage(posts, listings, state);
}
