import 'server-only';

import type { ReviewImage } from '@/lib/review/content';
import { type ContentRow, contentImages, fetchContent, fetchParentPostNumber } from '@/lib/review/data';
import type { ContentType } from '@/lib/review/schemas';

export type LoadedContent = { item: ContentRow; images: ReviewImage[]; parentNumber: number | null };

/** One item with what every detail view shows (images, the parent post number for comments); null if missing. */
export async function loadContent(type: ContentType, id: string): Promise<LoadedContent | null> {
  const item = await fetchContent(type, id);
  if (!item) return null;
  const parentNumber = type === 'comment' && item.post_id ? await fetchParentPostNumber(item.post_id) : null;
  return { item, images: contentImages(item), parentNumber };
}

/** A top-level comment (replies cascade with it when it is removed). */
export function isTopLevelComment(item: ContentRow): boolean {
  if (item.target_type !== 'comment') return false;
  const extra = item.extra as { parent_id?: unknown } | null;
  return extra?.parent_id == null;
}
