import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import { Constants } from '@/types/database';

const imageSchema = z.object({
  path: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  blurhash: z.string().nullish(),
});

const pollOptionSchema = z.object({ id: z.string(), label: z.string(), votes: z.number() });

// Views make every column nullable in the generated types; this narrows a
// feed_posts row to what a published post always has.
const feedPostSchema = z.object({
  id: z.string(),
  number: z.number().nullable(),
  kind: z.enum(Constants.public.Enums.post_kind),
  body: z.string(),
  target_name: z.string().nullable(),
  images: z.array(imageSchema).catch([]),
  ends_at: z.string().nullable(),
  author_id: z.string(),
  nickname: z.string().nullable(),
  avatar_key: z.string().nullable(),
  published_at: z.string(),
  reaction_count: z.number(),
  comment_count: z.number(),
  my_reaction: z.enum(Constants.public.Enums.reaction_type).nullable(),
  poll_options: z.array(pollOptionSchema).nullable().catch(null),
  my_vote: z.string().nullable(),
  // Missing on rows cached before the column existed.
  edited_at: z.string().nullable().catch(null),
});

export type FeedPost = z.infer<typeof feedPostSchema>;
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

/** posts.images / listings.images JSON; invalid entries make it an empty list. */
export function parseImages(json: unknown): PostImage[] {
  const parsed = z.array(imageSchema).safeParse(json);
  return parsed.success ? parsed.data : [];
}

export function postImageUrl(path: string): string {
  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
