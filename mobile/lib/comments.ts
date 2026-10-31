import { logError, logInfo } from '@/lib/log';
import { parseTopReactions, type ReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import { parseTimestamp } from '@/lib/time';
import type { Tally } from '@/lib/reactionTally';
import type { Database } from '@/types/database';

export type CommentTarget = 'post' | 'listing';
export const COMMENT_MAX = 1000;
export const COMMENT_PAGE_SIZE = 30;
export const REPLY_PAGE_SIZE = 20;
// Mirrors edit_own_comment; the server re-checks.
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 'sending' exists only on the device until create_comment / create_reply answers. */
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
  /** Most used types, first = most used (up to 3). */
  topReactions: ReactionType[];
  /** Exact reactions per type when known (realtime rows, after my own tap); thread rows carry only the top 3. */
  reactionBreakdown?: Tally | null;
  /** Replies: the top-level comment they belong to (one level only). Null for top-level comments. */
  parentId: string | null;
  /** Replies: the exact comment answered (a top-level comment or another reply). */
  replyToId: string | null;
  /** Top-level comments: published replies. */
  replyCount: number;
};

export type CommentCursor = { ts: string; id: string };
export type CommentPage = { items: ThreadComment[]; nextCursor: CommentCursor | null };

type Status = Database['public']['Enums']['content_status'];
type ViewRow = Database['public']['Views']['thread_comments']['Row'];

/** A thread_comments row (get_comments / get_replies); null if it lacks what a published comment always has. */
function fromViewRow(c: ViewRow): ThreadComment | null {
  if (!c.id || c.body === null || !c.published_at || !c.author_id) return null;
  return {
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
    topReactions: parseTopReactions(c.top_reactions),
    parentId: c.parent_id,
    replyToId: c.reply_to_id,
    replyCount: c.reply_count ?? 0,
  };
}

/** Keyset page: the last row's (published_at, id), oldest first. A short page means the end. */
function toPage(rows: readonly ViewRow[], size: number): CommentPage {
  const items: ThreadComment[] = [];
  for (const row of rows) {
    const item = fromViewRow(row);
    if (item) items.push(item);
  }
  const last = items.at(-1);
  return { items, nextCursor: rows.length === size && last ? { ts: last.time, id: last.id } : null };
}

/** Top-level comments only; replies come from fetchReplyPage. */
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
  return toPage(data, COMMENT_PAGE_SIZE);
}

/** Replies of one top-level comment, oldest first (empty when the parent is not visible). */
export async function fetchReplyPage(parentId: string, cursor: CommentCursor | null): Promise<CommentPage> {
  const { data, error } = await supabase.rpc('get_replies', {
    p_parent_id: parentId,
    p_after_ts: cursor?.ts,
    p_after_id: cursor?.id,
    p_limit: REPLY_PAGE_SIZE,
  });
  if (error) {
    logError('rpc.get_replies', error);
    throw error;
  }
  return toPage(data, REPLY_PAGE_SIZE);
}

type Author = { id: string; nickname: string | null; avatarKey: string | null };

/** My own comments and replies on this target that a keyword filter is holding (RLS lets authors read them). */
export async function fetchOwnPending(target: CommentTarget, targetId: string, me: Author): Promise<ThreadComment[]> {
  const column = target === 'post' ? 'post_id' : 'listing_id';
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, edited_at, parent_id, reply_to_id')
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
    topReactions: [],
    parentId: c.parent_id,
    replyToId: c.reply_to_id,
    replyCount: 0,
  }));
}

type CommentRow = {
  id: string;
  body: string;
  status: Status;
  created_at: string;
  published_at: string | null;
  edited_at: string | null;
  parent_id: string | null;
  reply_to_id: string | null;
  reply_count: number;
};

/** A server comments row (create / reply / edit) as a thread item, with my own profile for display. */
export function fromRow(row: CommentRow, me: Author): ThreadComment {
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
    topReactions: [],
    parentId: row.parent_id,
    replyToId: row.reply_to_id,
    replyCount: row.reply_count,
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

/** `toId` is the comment answered; the server files the reply under its top-level comment. */
export async function createReply(toId: string, body: string) {
  const { data, error } = await supabase.rpc('create_reply', { p_to_comment_id: toId, p_body: body });
  if (error) {
    logError('rpc.create_reply', error);
    throw error;
  }
  logInfo('rpc.create_reply', 'ok', { status: data.status });
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
