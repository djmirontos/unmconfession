import { logError, logInfo } from '@/lib/log';
import type { ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import { parseTimestamp } from '@/lib/time';
import type { Database } from '@/types/database';

export type CommentTarget = 'post' | 'listing';
export const COMMENT_MAX = 1000;
export const COMMENT_PAGE_SIZE = 30;
// Mirrors edit_own_comment; the server re-checks.
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 'sending' exists only on the device until create_comment answers. */
export type CommentState = 'published' | 'pending' | 'sending';

export type ThreadComment = {
  id: string;
  body: string;
  authorId: string;
  nickname: string | null;
  avatarKey: string | null;
  /** When it went public; for pending/sending rows, when it was written. */
  time: string;
  /** Best known creation time (published_at for published rows: get_comments has no created_at). */
  createdAt: string;
  editedAt: string | null;
  state: CommentState;
  reactionCount: number;
  myReaction: ReactionType | null;
};

export type CommentCursor = { ts: string; id: string };
export type CommentPage = { items: ThreadComment[]; nextCursor: CommentCursor | null };

type Status = Database['public']['Enums']['content_status'];

export async function fetchCommentPage(target: CommentTarget, targetId: string, cursor: CommentCursor | null): Promise<CommentPage> {
  const { data, error } = await supabase.rpc('get_comments', {
    p_target_type: target,
    p_target_id: targetId,
    p_after_ts: cursor?.ts,
    p_after_id: cursor?.id,
    p_limit: COMMENT_PAGE_SIZE,
  });
  if (error) {
    logError('rpc.get_comments', error, { target });
    throw error;
  }
  const items: ThreadComment[] = [];
  for (const c of data) {
    if (!c.id || c.body === null || !c.published_at || !c.author_id) continue;
    items.push({
      id: c.id,
      body: c.body,
      authorId: c.author_id,
      nickname: c.nickname,
      avatarKey: c.avatar_key,
      time: c.published_at,
      createdAt: c.published_at,
      editedAt: c.edited_at,
      state: 'published',
      reactionCount: c.reaction_count ?? 0,
      myReaction: c.my_reaction,
    });
  }
  const last = items.at(-1);
  // Keyset cursor: the last row's (published_at, id), oldest first. A short page means the end.
  return { items, nextCursor: data.length === COMMENT_PAGE_SIZE && last ? { ts: last.time, id: last.id } : null };
}

type Author = { id: string; nickname: string | null; avatarKey: string | null };

/** My own comments on this target that a keyword filter is holding (RLS lets authors read them). */
export async function fetchOwnPending(target: CommentTarget, targetId: string, me: Author): Promise<ThreadComment[]> {
  const column = target === 'post' ? 'post_id' : 'listing_id';
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, edited_at')
    .eq(column, targetId)
    .eq('author_id', me.id)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    logError('comments.ownPending', error, { target });
    throw error;
  }
  return data.map((c) => ({
    id: c.id,
    body: c.body,
    authorId: me.id,
    nickname: me.nickname,
    avatarKey: me.avatarKey,
    time: c.created_at,
    createdAt: c.created_at,
    editedAt: c.edited_at,
    state: 'pending',
    reactionCount: 0,
    myReaction: null,
  }));
}

/** A server comments row (create / edit) as a thread item, with my own profile for display. */
export function fromRow(
  row: { id: string; body: string; status: Status; created_at: string; published_at: string | null; edited_at: string | null },
  me: Author,
): ThreadComment {
  const published = row.status === 'published';
  return {
    id: row.id,
    body: row.body,
    authorId: me.id,
    nickname: me.nickname,
    avatarKey: me.avatarKey,
    time: published ? (row.published_at ?? row.created_at) : row.created_at,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    state: published ? 'published' : 'pending',
    // A new or just-edited row of mine; an edit keeps the counts already shown (see storeComment).
    reactionCount: 0,
    myReaction: null,
  };
}

export async function createComment(target: CommentTarget, targetId: string, body: string) {
  const { data, error } = await supabase.rpc('create_comment', { p_target_type: target, p_target_id: targetId, p_body: body });
  if (error) {
    logError('rpc.create_comment', error, { target });
    throw error;
  }
  logInfo('rpc.create_comment', 'ok', { status: data.status });
  return data;
}

export async function editOwnComment(id: string, body: string) {
  const { data, error } = await supabase.rpc('edit_own_comment', { p_comment_id: id, p_body: body });
  if (error) {
    logError('rpc.edit_own_comment', error, { id });
    throw error;
  }
  logInfo('rpc.edit_own_comment', 'ok', { status: data.status });
  return data;
}

export async function deleteOwnComment(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_own_comment', { p_comment_id: id });
  if (error) {
    logError('rpc.delete_own_comment', error, { id });
    throw error;
  }
  logInfo('rpc.delete_own_comment', 'ok');
}

/** Published or pending and written less than 24 hours ago. */
export function canEditComment(c: ThreadComment, now = Date.now()): boolean {
  return (c.state === 'published' || c.state === 'pending') && parseTimestamp(c.createdAt) + EDIT_WINDOW_MS > now;
}
