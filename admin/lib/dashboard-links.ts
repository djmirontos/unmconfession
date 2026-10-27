import type { Database } from '@/types/database';

type Counts = Database['public']['Functions']['mod_dashboard']['Returns'][number];

/**
 * Where each dashboard number links to. Only where an existing page has a filter that shows
 * exactly those items; null means the tile is plain text:
 * - new_users_24h: the users list has no "joined in the last 24 hours" filter.
 * - deleted_accounts: "Show deleted accounts" adds deleted accounts to the list, it does not
 *   show only them.
 * (The 24-hour content tiles open the content list for that type, newest first.)
 */
export const DASHBOARD_LINKS: Record<keyof Counts, string | null> = {
  pending_posts: '/review?filter=post',
  pending_comments: '/review?filter=comment',
  pending_listings: '/review?filter=listing',
  reported_items: '/reports',
  open_reports: '/reports',
  posts_24h: '/content?type=post',
  comments_24h: '/content?type=comment',
  listings_24h: '/content?type=listing',
  new_users_24h: null,
  suspended_users: '/users?status=suspended',
  banned_users: '/users?status=banned',
  deleted_accounts: null,
};
