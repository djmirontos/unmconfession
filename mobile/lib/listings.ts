import type { Condition, LostFoundType } from '@/lib/createSchemas';
import { formatEventDate } from '@/lib/manilaDate';
import type { PostImage } from '@/lib/posts';
import type { Database } from '@/types/database';

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

/** What a listing card shows. Built from own rows (My Posts) or feed_listings (Buy & Sell, later). */
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
  nickname: string | null;
  avatarKey: string | null;
  /** published_at, or created_at while not published. */
  time: string;
  editedAt: string | null;
  commentCount: number;
};

/** "Lost on Oct 9 · Library 2F" / "Found on …" ("On …" if the type is unknown). */
export function formatEventLine(lostFoundType: LostFoundType | null, eventDate: string | null, location: string | null): string | null {
  if (!eventDate) return null;
  const verb = lostFoundType === 'lost' ? 'Lost on' : lostFoundType === 'found' ? 'Found on' : 'On';
  const date = `${verb} ${formatEventDate(eventDate)}`;
  return location ? `${date} · ${location}` : date;
}
