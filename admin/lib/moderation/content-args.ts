import type { KeysetCursor } from '@/lib/moderation/schemas';
import type { ContentType } from '@/lib/review/schemas';
import type { Database } from '@/types/database';

export type ContentFilters = {
  type?: ContentType;
  status?: Database['public']['Enums']['content_status'];
  q?: string;
  /** One user's content (the user page). */
  author?: string;
};

type ContentArgs = Database['public']['Functions']['mod_list_content']['Args'];

/** mod_list_content arguments: only the filters that are set, plus the keyset cursor. */
export function contentListArgs(filters: ContentFilters, limit: number, cursor?: KeysetCursor): ContentArgs {
  return {
    p_limit: limit,
    ...(filters.type ? { p_type: filters.type } : {}),
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.q ? { p_search: filters.q } : {}),
    ...(filters.author ? { p_author: filters.author } : {}),
    ...(cursor ? { p_after_ts: cursor.ts, p_after_id: cursor.id } : {}),
  };
}
