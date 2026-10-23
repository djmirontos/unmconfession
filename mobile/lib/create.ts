import type { Condition } from '@/lib/createSchemas';
import { logError, logInfo } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

type PostKind = Database['public']['Enums']['post_kind'];

/** Shape stored in posts.images / listings.images. */
export type StoredImage = { path: string; width: number; height: number; blurhash: string | null };

export type CreatedPost = { kind: 'post'; id: string; postKind: PostKind; number: number | null; published: boolean };
export type CreatedListing = { kind: 'listing'; id: string; published: boolean };
export type Created = CreatedPost | CreatedListing;

export type PostInput =
  | { kind: 'confession'; body: string }
  | { kind: 'shoutout'; body: string; target: string }
  | { kind: 'poll'; question: string; options: string[]; hours: number };

export type ListingInput =
  | { kind: 'sell'; title: string; description: string; price: number; condition: Condition }
  | { kind: 'lost_found'; title: string; description: string; location: string; eventDate: string };

/** create_post. The returned row says whether it went live or is held; never why. */
export async function createPost(input: PostInput, images: StoredImage[]): Promise<CreatedPost> {
  const args =
    input.kind === 'poll'
      ? {
          p_kind: input.kind,
          p_body: input.question,
          p_poll_options: input.options,
          p_ends_at: new Date(Date.now() + input.hours * 3600 * 1000).toISOString(),
        }
      : {
          p_kind: input.kind,
          p_body: input.body,
          p_target_name: input.kind === 'shoutout' ? input.target : undefined,
          p_images: images,
        };
  const { data, error } = await supabase.rpc('create_post', args);
  if (error) {
    logError('rpc.create_post', error, { kind: input.kind, images: images.length });
    throw error;
  }
  logInfo('rpc.create_post', 'ok', { kind: input.kind, status: data.status, number: data.number });
  return { kind: 'post', id: data.id, postKind: data.kind, number: data.number, published: data.status === 'published' };
}

export async function createListing(input: ListingInput, images: StoredImage[]): Promise<CreatedListing> {
  const { data, error } = await supabase.rpc('create_listing', {
    p_kind: input.kind,
    p_title: input.title,
    p_description: input.description || undefined,
    p_images: images,
    ...(input.kind === 'sell'
      ? { p_price: input.price, p_condition: input.condition }
      : { p_location: input.location, p_event_date: input.eventDate }),
  });
  if (error) {
    logError('rpc.create_listing', error, { kind: input.kind, images: images.length });
    throw error;
  }
  logInfo('rpc.create_listing', 'ok', { kind: input.kind, status: data.status });
  return { kind: 'listing', id: data.id, published: data.status === 'published' };
}
