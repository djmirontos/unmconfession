import type { QueryClient } from '@tanstack/react-query';

import { invalidateAuthoredLists } from '@/lib/authoredLists';
import { DELETED_USER_LABEL } from '@/lib/authorLabel';
import type { RepliesData, ThreadData } from '@/lib/commentCache';
import { updateListedListings } from '@/lib/listings';
import { logError, logInfo } from '@/lib/log';
import { updateListedPosts } from '@/lib/postLists';
import { supabase } from '@/lib/supabase';

export type BlockedUser = { id: string; nickname: string | null; avatarKey: string | null; blockedAt: string };

/** "@nickname" for menus, dialogs and toasts ("Deleted user" for a deleted account). */
export const atNickname = (nickname: string | null) => (nickname ? `@${nickname}` : DELETED_USER_LABEL);

/** Private to the signed-in user; not in the persisted allowlist. */
export const blockedUsersKey = (userId: string) => ['blocked-users', userId] as const;

const UNIQUE_VIOLATION = '23505';

export async function fetchBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at, profile:profiles!user_blocks_blocked_id_fkey(nickname, avatar_key)')
    .eq('blocker_id', userId)
    .eq('kind', 'block')
    .order('created_at', { ascending: false });
  if (error) {
    logError('blocks.list', error);
    throw error;
  }
  return data.map((row) => ({
    id: row.blocked_id,
    nickname: row.profile?.nickname ?? null,
    avatarKey: row.profile?.avatar_key ?? null,
    blockedAt: row.created_at,
  }));
}

/** An existing block counts as success. */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId, kind: 'block' });
  if (error && error.code !== UNIQUE_VIOLATION) {
    logError('blocks.insert', error);
    throw error;
  }
  logInfo('blocks.insert', 'ok');
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) {
    logError('blocks.delete', error);
    throw error;
  }
  logInfo('blocks.delete', 'ok');
}

/** After a block: drop the author's posts and comments from every cached list at once, then refetch. */
export function afterBlock(queryClient: QueryClient, userId: string, authorId: string): void {
  // Feed, Trending and active polls.
  updateListedPosts(queryClient, (p) => (p.author_id === authorId ? null : p));
  updateListedListings(queryClient, (l) => (l.authorId === authorId ? null : l));
  queryClient.setQueriesData<ThreadData>({ queryKey: ['comments'] }, (data) => {
    if (!data || !data.pages.some((page) => page.items.some((c) => c.authorId === authorId))) return data;
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((c) => c.authorId !== authorId) })) };
  });
  queryClient.setQueriesData<RepliesData>({ queryKey: ['replies'] }, (data) =>
    data && data.items.some((c) => c.authorId === authorId)
      ? { ...data, items: data.items.filter((c) => c.authorId !== authorId) }
      : data,
  );
  invalidateAuthoredLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: blockedUsersKey(userId) });
  void queryClient.invalidateQueries({ queryKey: ['blocked-by-me'] });
}

/** After an unblock: their content comes back with the refetch. */
export function afterUnblock(queryClient: QueryClient): void {
  invalidateAuthoredLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['blocked-by-me'] });
}
