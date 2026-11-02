import { z } from 'zod';

import { feedPostSchema, imageSchema, pollOptionSchema } from '@/lib/feedPostSchema';
import type { Tally } from '@/lib/reactionTally';
import { supabase } from '@/lib/supabase';

export type FeedPost = z.output<typeof feedPostSchema> & {
  /**
   * Exact reactions per type, when known (feed rows carry only the top 3): set after my own tap
   * is confirmed and in My Posts; cleared when a counts refresh changes the reactions.
   */
  reaction_breakdown?: Tally | null;
};
export type PostImage = z.infer<typeof imageSchema>;
export type PollOption = z.infer<typeof pollOptionSchema>;

/** Drops rows that do not match (never expected from the view). */
export function parsePosts(rows: readonly unknown[]): FeedPost[] {
  const posts: FeedPost[] = [];
  for (const row of rows) {
    const parsed = feedPostSchema.safeParse(row);
    if (parsed.success) posts.push(parsed.data);
  }
  return posts;
}

export function parsePost(row: unknown): FeedPost | null {
  const parsed = feedPostSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/** feed_posts.poll_options JSON; null when missing or invalid. */
export function parsePollOptions(json: unknown): PollOption[] | null {
  const parsed = z.array(pollOptionSchema).safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** posts.images / listings.images JSON; invalid entries make it an empty list. */
export function parseImages(json: unknown): PostImage[] {
  const parsed = z.array(imageSchema).safeParse(json);
  return parsed.success ? parsed.data : [];
}

export function postImageUrl(path: string): string {
  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
