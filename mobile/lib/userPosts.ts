import { FEED_PAGE_SIZE, type FeedCursor, type FeedPage } from '@/lib/feed';
import { logError } from '@/lib/log';
import { parsePosts } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

/** Per viewer, like the feed (rows carry my_reaction and my_vote). Not persisted. */
export const userPostsKey = (authorId: string, viewerId: string | null) => ['user-posts', authorId, viewerId ?? 'guest'] as const;

/**
 * One member's published posts, newest first, keyset-paged on (published_at, id) like get_feed.
 * feed_posts already hides authors I blocked.
 */
export async function fetchUserPostsPage(authorId: string, cursor: FeedCursor | null): Promise<FeedPage> {
  let query = supabase
    .from('feed_posts')
    .select('*')
    .eq('author_id', authorId)
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE);
  // Quoted: the timestamp holds characters that PostgREST's or() syntax reserves.
  if (cursor) query = query.or(`published_at.lt."${cursor.ts}",and(published_at.eq."${cursor.ts}",id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) {
    logError('userPosts.page', error);
    throw error;
  }
  const items = parsePosts(data);
  const last = items.at(-1);
  const nextCursor = data.length === FEED_PAGE_SIZE && last ? { ts: last.published_at, id: last.id } : null;
  return { items, nextCursor };
}
