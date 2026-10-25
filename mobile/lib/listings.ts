import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { Condition, LostFoundType } from '@/lib/createSchemas';
import { LOST_FOUND_TYPES } from '@/lib/createSchemas';
import { logError, logInfo } from '@/lib/log';
import { formatEventDate } from '@/lib/manilaDate';
import type { MyPostsPage } from '@/lib/myPosts';
import { parseImages, type PostImage } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { Constants, type Database } from '@/types/database';

export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const peso = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 });

/** 1250.5 -> "₱1,250.5"; 0 -> "Free". */
export function formatPrice(value: number): string {
  return value === 0 ? 'Free' : `₱${peso.format(value)}`;
}

/** What a listing card and the listing screen show. Built from own rows (My Posts) or feed_listings. */
export type ListingCardData = {
  id: string;
  kind: Database['public']['Enums']['listing_kind'];
  lostFoundType: LostFoundType | null;
  title: string;
  description: string | null;
  price: number | null;
  condition: string | null;
  location: string | null;
  eventDate: string | null;
  images: PostImage[];
  authorId: string;
  nickname: string | null;
  avatarKey: string | null;
  /** published_at, or created_at while not published. */
  time: string;
  editedAt: string | null;
  commentCount: number;
  /** Sold / found / claimed. */
  isClosed: boolean;
};

/** "Lost on Oct 9 · Library 2F" / "Found on …" ("On …" if the type is unknown). */
export function formatEventLine(lostFoundType: LostFoundType | null, eventDate: string | null, location: string | null): string | null {
  if (!eventDate) return null;
  const date = `${eventVerb(lostFoundType)} ${formatEventDate(eventDate)}`;
  return location ? `${date} · ${location}` : date;
}

export function eventVerb(lostFoundType: LostFoundType | null): string {
  return lostFoundType === 'lost' ? 'Lost on' : lostFoundType === 'found' ? 'Found on' : 'On';
}

/** The badge of a closed listing: a lost item was found, a found item was claimed. */
export function closedLabel(listing: Pick<ListingCardData, 'kind' | 'lostFoundType'>): string {
  if (listing.kind === 'sell') return 'Sold';
  return listing.lostFoundType === 'lost' ? 'Found' : listing.lostFoundType === 'found' ? 'Claimed' : 'Closed';
}

/** The owner's toggle: close ("Mark as sold") or reopen ("Mark as available" / "Reopen"). */
export function closeActionLabel(listing: Pick<ListingCardData, 'kind' | 'lostFoundType' | 'isClosed'>): string {
  if (listing.kind === 'sell') return listing.isClosed ? 'Mark as available' : 'Mark as sold';
  if (listing.isClosed) return 'Reopen';
  return listing.lostFoundType === 'lost' ? 'Mark as found' : listing.lostFoundType === 'found' ? 'Mark as claimed' : 'Mark as closed';
}

// ---------------------------------------------------------------------------
// One listing (detail screen)

/** Per viewer: feed_listings hides blocked authors. Not persisted. */
export const listingKey = (id: string, userId: string | null) => ['listing', id, userId ?? 'guest'] as const;

// Views make every column nullable in the generated types; this narrows a published row.
const listingRowSchema = z.object({
  id: z.string(),
  kind: z.enum(Constants.public.Enums.listing_kind),
  title: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  condition: z.string().nullable(),
  location: z.string().nullable(),
  event_date: z.string().nullable(),
  images: z.unknown(),
  is_closed: z.boolean().catch(false),
  author_id: z.string(),
  nickname: z.string().nullable(),
  avatar_key: z.string().nullable(),
  published_at: z.string(),
  comment_count: z.number().catch(0),
  lost_found_type: z.string().nullable(),
  edited_at: z.string().nullable(),
});

/** A published listing, or null when it is gone, held, removed or by someone the viewer blocked. */
export async function fetchListing(id: string): Promise<ListingCardData | null> {
  const { data, error } = await supabase.from('feed_listings').select('*').eq('id', id).maybeSingle();
  if (error) {
    logError('listing.fetch', error);
    throw error;
  }
  const parsed = listingRowSchema.safeParse(data);
  if (!data || !parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    kind: r.kind,
    lostFoundType: LOST_FOUND_TYPES.find((t) => t === r.lost_found_type) ?? null,
    title: r.title,
    description: r.description,
    price: r.price,
    condition: r.condition,
    location: r.location,
    eventDate: r.event_date,
    images: parseImages(r.images),
    authorId: r.author_id,
    nickname: r.nickname,
    avatarKey: r.avatar_key,
    time: r.published_at,
    editedAt: r.edited_at,
    commentCount: r.comment_count,
    isClosed: r.is_closed,
  };
}

export async function setListingClosed(id: string, closed: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_listing_closed', { p_listing_id: id, p_closed: closed });
  if (error) {
    logError('rpc.set_listing_closed', error);
    throw error;
  }
  logInfo('rpc.set_listing_closed', 'ok', { closed });
}

// ---------------------------------------------------------------------------
// Cache patching: the listing screen and My Posts (no other listing lists exist yet).

function patchListing(queryClient: QueryClient, id: string, change: (listing: ListingCardData) => ListingCardData): void {
  queryClient.setQueriesData<ListingCardData | null>({ queryKey: ['listing', id] }, (listing) => (listing ? change(listing) : listing));
  queryClient.setQueriesData<InfiniteData<MyPostsPage>>({ queryKey: ['my-posts'] }, (data) => {
    if (!data || !data.pages.some((p) => p.items.some((i) => i.listingCard?.id === id))) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        items: p.items.map((i) => (i.listingCard?.id === id ? { ...i, listingCard: change(i.listingCard) } : i)),
      })),
    };
  });
}

export function patchListingClosed(queryClient: QueryClient, id: string, closed: boolean): void {
  patchListing(queryClient, id, (l) => (l.isClosed === closed ? l : { ...l, isClosed: closed }));
}

/** comment_count += delta (never below 0) on the cached listing screen and My Posts card. */
export function bumpListingCommentCount(queryClient: QueryClient, id: string, delta: number): void {
  patchListing(queryClient, id, (l) => ({ ...l, commentCount: Math.max(0, l.commentCount + delta) }));
}
