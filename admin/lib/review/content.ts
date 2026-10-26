import { z } from 'zod';

// Parsing of the JSON columns returned by the moderation RPCs.

const imageSchema = z.object({ path: z.string(), width: z.number().positive(), height: z.number().positive() });

export type ReviewImage = { url: string; width: number; height: number };

// Paths are written by the app as <uid>/<uuid>.jpg; anything else is skipped.
const SAFE_PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/;

/** Public URLs of the post-images bucket for the stored image list; invalid entries are dropped. */
export function parseImages(json: unknown, supabaseUrl: string): ReviewImage[] {
  const parsed = z.array(z.unknown()).safeParse(json);
  if (!parsed.success) return [];
  const origin = new URL(supabaseUrl).origin;
  return parsed.data.flatMap((raw) => {
    const image = imageSchema.safeParse(raw);
    if (!image.success || !SAFE_PATH.test(image.data.path) || image.data.path.includes('..')) return [];
    const path = image.data.path.split('/').map(encodeURIComponent).join('/');
    return [{ url: `${origin}/storage/v1/object/public/post-images/${path}`, width: image.data.width, height: image.data.height }];
  });
}

export function imageCount(json: unknown): number {
  const parsed = z.array(z.unknown()).safeParse(json);
  return parsed.success ? parsed.data.length : 0;
}

const postExtraSchema = z.object({
  target_name: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

const listingExtraSchema = z.object({
  price: z.union([z.number(), z.string()]).nullable().optional(),
  condition: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  event_date: z.string().nullable().optional(),
  is_closed: z.boolean().nullable().optional(),
  lost_found_type: z.string().nullable().optional(),
});

export type PostExtra = z.infer<typeof postExtraSchema>;
export type ListingExtra = z.infer<typeof listingExtraSchema>;

export function parsePostExtra(json: unknown): PostExtra {
  const parsed = postExtraSchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}

export function parseListingExtra(json: unknown): ListingExtra {
  const parsed = listingExtraSchema.safeParse(json);
  return parsed.success ? parsed.data : {};
}
