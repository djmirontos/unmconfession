import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { authorLabel } from '@/lib/authorLabel';
import { logError } from '@/lib/log';
import { REACTION_TYPES, type ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import { Constants } from '@/types/database';

export const NOTIFICATIONS_PAGE_SIZE = 20;

// Both are per user and never persisted (not in the queryClient allowlist).
export const notificationsKey = (userId: string) => ['notifications', userId] as const;
export const unreadCountKey = (userId: string) => ['notifications-unread', userId] as const;

const NOTIFICATION_TYPES = [
  'comment',
  'reaction',
  'comment_reaction',
  'reply',
  'content_approved',
  'content_rejected',
  'content_removed',
  'return_request',
  'return_confirmed',
  'sale_request',
  'sale_confirmed',
] as const;

// RPC table columns are typed non-null by the generator; the real nulls are narrowed here.
const rowSchema = z.object({
  group_key: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  target_type: z.enum(Constants.public.Enums.content_type),
  target_id: z.string(),
  latest_at: z.string(),
  event_count: z.number(),
  actor_count: z.number(),
  unread_count: z.number(),
  actor_id: z.string().nullable(),
  actor_nickname: z.string().nullable(),
  actor_avatar_key: z.string().nullable(),
  reaction_type: z.enum(REACTION_TYPES as [ReactionType, ...ReactionType[]]).nullable().catch(null),
  reason: z.string().nullable(),
  target_exists: z.boolean(),
  target_status: z.string().nullable(),
  target_kind: z.string().nullable(),
  target_preview: z.string().nullable(),
  parent_post_id: z.string().nullable(),
  parent_listing_id: z.string().nullable(),
});

export type NotificationGroup = z.infer<typeof rowSchema>;
export type NotificationCursor = { ts: string; key: string };
export type NotificationPage = { items: NotificationGroup[]; nextCursor: NotificationCursor | null };
export type NotificationsData = InfiniteData<NotificationPage, NotificationCursor | null>;

export async function fetchNotificationPage(cursor: NotificationCursor | null): Promise<NotificationPage> {
  const { data, error } = await supabase.rpc('get_notifications', {
    p_before_ts: cursor?.ts,
    p_before_key: cursor?.key,
    p_limit: NOTIFICATIONS_PAGE_SIZE,
  });
  if (error) {
    logError('rpc.get_notifications', error);
    throw error;
  }
  const items: NotificationGroup[] = [];
  for (const row of data) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
  }
  const last = items.at(-1);
  // Keyset cursor: the last row's (latest_at, group_key). A short page means the end.
  const nextCursor = data.length === NOTIFICATIONS_PAGE_SIZE && last ? { ts: last.latest_at, key: last.group_key } : null;
  return { items, nextCursor };
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_notification_count');
  if (error) {
    logError('rpc.get_unread_notification_count', error);
    throw error;
  }
  return data;
}

/** null = every notification. */
export async function markNotificationsRead(keys: readonly string[] | null): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read', keys ? { p_keys: [...keys] } : {});
  if (error) {
    logError('rpc.mark_notifications_read', error);
    throw error;
  }
}

export async function deleteNotifications(keys: readonly string[]): Promise<void> {
  const { error } = await supabase.rpc('delete_notifications', { p_keys: [...keys] });
  if (error) {
    logError('rpc.delete_notifications', error);
    throw error;
  }
}

/** Every notification of mine: a direct delete (the authenticated delete grant; RLS keeps it to my rows). */
export async function deleteAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) {
    logError('notifications.deleteAll', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Wording

/** "confession" / "shoutout" / "poll" / "comment" / "listing". */
export function targetWord(n: Pick<NotificationGroup, 'target_type' | 'target_kind'>): string {
  if (n.target_type === 'comment') return 'comment';
  if (n.target_type === 'listing') return 'listing';
  const kind = n.target_kind;
  return kind === 'confession' || kind === 'shoutout' || kind === 'poll' ? kind : 'post';
}

/** The main line, e.g. "tester_two and 3 others reacted to your post". */
export function describeNotification(n: NotificationGroup): string {
  // Only reactions, comments and replies name an actor; a missing nickname there is a deleted account.
  const actor = authorLabel(n.actor_nickname);
  const where = n.target_type === 'listing' ? 'listing' : 'post';
  const others = n.actor_count - 1;
  const andOthers = others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : '';
  switch (n.type) {
    case 'comment':
      if (others <= 0 && n.event_count > 1) return `${actor} commented ${n.event_count} times on your ${where}`;
      return `${actor}${andOthers} commented on your ${where}`;
    case 'reaction':
      return `${actor}${andOthers} reacted to your ${where}`;
    case 'comment_reaction':
      return `${actor}${andOthers} reacted to your comment`;
    case 'reply':
      return `${actor}${andOthers} replied to your comment`;
    case 'content_approved':
      return `Your ${targetWord(n)} was approved`;
    case 'content_rejected':
      return `Your ${targetWord(n)} was rejected`;
    case 'content_removed':
      return `Your ${targetWord(n)} was removed`;
    case 'return_request':
      return `${actor} says they returned your item. Tap to confirm.`;
    case 'return_confirmed':
      return `${actor} confirmed you returned their item.`;
    case 'sale_request':
      return `${actor} says you bought their item. Tap to confirm.`;
    case 'sale_confirmed':
      return `${actor} confirmed your sale.`;
  }
}

// ---------------------------------------------------------------------------
// Cache patching (optimistic read / delete; realtime and refetches reconcile)

function patchGroups(
  queryClient: QueryClient,
  userId: string,
  change: (group: NotificationGroup) => NotificationGroup | null,
): void {
  queryClient.setQueryData<NotificationsData>(notificationsKey(userId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.flatMap((g) => {
              const next = change(g);
              return next ? [next] : [];
            }),
          })),
        }
      : data,
  );
}

/** Marks groups read in the cache (null = all) and lowers the badge by the groups that were unread. */
export function patchRead(queryClient: QueryClient, userId: string, keys: readonly string[] | null, wasUnread: number): void {
  const set = keys ? new Set(keys) : null;
  patchGroups(queryClient, userId, (g) => (!set || set.has(g.group_key) ? { ...g, unread_count: 0 } : g));
  queryClient.setQueryData<number>(unreadCountKey(userId), (count) =>
    count === undefined ? count : keys === null ? 0 : Math.max(0, count - wasUnread),
  );
}

export function patchDelete(queryClient: QueryClient, userId: string, key: string, wasUnread: boolean): void {
  patchGroups(queryClient, userId, (g) => (g.group_key === key ? null : g));
  if (wasUnread) queryClient.setQueryData<number>(unreadCountKey(userId), (count) => (count === undefined ? count : Math.max(0, count - 1)));
}

/** Empties the list (one empty page, so the empty state shows) and zeroes the badge. */
export function patchDeleteAll(queryClient: QueryClient, userId: string): void {
  queryClient.setQueryData<NotificationsData>(notificationsKey(userId), (data) =>
    data ? { pages: [{ items: [], nextCursor: null }], pageParams: [null] } : data,
  );
  queryClient.setQueryData<number>(unreadCountKey(userId), (count) => (count === undefined ? count : 0));
}

/** Refetch the badge and the list. A list nobody is looking at is cut to its first page first (cheap to reload). */
export function invalidateNotifications(queryClient: QueryClient): void {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['notifications'] })) {
    if (query.getObserversCount() > 0) continue;
    queryClient.setQueryData<NotificationsData>(query.queryKey, (data) =>
      data && data.pages.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
  }
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
}
