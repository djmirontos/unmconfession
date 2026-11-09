import { z } from 'zod';

import { type ChatMessage, type ChatRequest, type Conversation, type Cursor, MESSAGE_PAGE_SIZE } from '@/lib/chat';
import { chunkIds, type ReactionKey, type ReactionRow } from '@/lib/chatReactions';
import type { ChatReportReason } from '@/lib/chatReports';
import { getErrorCode } from '@/lib/errors';
import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

// The chat RPCs (20261105100000_chat_core.sql). Clients never touch the chat tables: every call
// here is one of these functions. Failures are logged by code only, never with the error object,
// so no message or request text can reach a log (a Postgres error can echo the failing row).

/** Dev log of a failed chat call: the scope and the error code, nothing else. */
export function logChatError(scope: string, error: unknown): void {
  logError(`chat.${scope}`, { code: getErrorCode(error) ?? 'unknown' });
}

/** chat_disabled at runtime (the switch was turned off): the gate reads again and the UI hides. */
function onChatError(scope: string, error: unknown): never {
  logChatError(scope, error);
  if (getErrorCode(error) === 'chat_disabled') {
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'chat' && q.queryKey[2] === 'mode' });
  }
  throw error;
}

// The generated types call several of these non-null; the functions can return null for them.
const conversationRow = z.object({
  conversation_id: z.string(),
  status: z.enum(['accepted', 'pending_sent']),
  other_id: z.string(),
  other_nickname: z.string(),
  other_avatar_key: z.string().nullable(),
  last_message_body: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_message_sender: z.string().nullable(),
  unread_count: z.number(),
  muted: z.boolean(),
  is_online: z.boolean().nullable(),
});

const requestRow = z.object({
  conversation_id: z.string(),
  from_id: z.string(),
  from_nickname: z.string(),
  from_avatar_key: z.string().nullable(),
  body: z.string(),
  requested_at: z.string(),
});

const messageRow = z.object({
  id: z.string(),
  sender_id: z.string(),
  body: z.string().nullable(),
  reply_to_id: z.string().nullable(),
  reply_body: z.string().nullable(),
  reply_sender_id: z.string().nullable(),
  created_at: z.string(),
  deleted: z.boolean(),
});

const unreadRow = z.object({ unread_chats: z.number(), pending_requests: z.number() });
const settingsRow = z.object({ who_can_message: z.enum(['everyone', 'nobody']), show_online: z.boolean() });

export type ChatUnread = { unreadChats: number; pendingRequests: number };
export type WhoCanMessage = 'everyone' | 'nobody';
export type ChatSettings = { whoCanMessage: WhoCanMessage; showOnline: boolean };

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('get_conversations');
  if (error) onChatError('conversations', error);
  return z.array(conversationRow).parse(data ?? []).map((r) => ({
    id: r.conversation_id,
    status: r.status,
    otherId: r.other_id,
    otherNickname: r.other_nickname,
    otherAvatarKey: r.other_avatar_key,
    lastBody: r.last_message_body,
    lastAt: r.last_message_at,
    lastSender: r.last_message_sender,
    unread: r.unread_count,
    muted: r.muted,
    isOnline: r.is_online,
  }));
}

export async function fetchChatRequests(): Promise<ChatRequest[]> {
  const { data, error } = await supabase.rpc('get_chat_requests');
  if (error) onChatError('requests', error);
  return z.array(requestRow).parse(data ?? []).map((r) => ({
    id: r.conversation_id,
    fromId: r.from_id,
    fromNickname: r.from_nickname,
    fromAvatarKey: r.from_avatar_key,
    body: r.body,
    requestedAt: r.requested_at,
  }));
}

/** Newest first; `before` is the oldest message already shown (keyset on created_at, id). */
export async function fetchMessages(conversationId: string, before: Cursor | null, limit = MESSAGE_PAGE_SIZE): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc('get_messages', {
    p_conversation: conversationId,
    ...(before ? { p_before_at: before.at, p_before_id: before.id } : {}),
    p_limit: limit,
  });
  if (error) onChatError('messages', error);
  return z.array(messageRow).parse(data ?? []).map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    body: r.body,
    replyToId: r.reply_to_id,
    replyBody: r.reply_body,
    replySenderId: r.reply_sender_id,
    createdAt: r.created_at,
    deleted: r.deleted,
  }));
}

export async function fetchChatUnread(): Promise<ChatUnread> {
  const { data, error } = await supabase.rpc('get_chat_unread_count');
  if (error) onChatError('unread', error);
  const row = z.array(unreadRow).parse(data ?? [])[0];
  return { unreadChats: row?.unread_chats ?? 0, pendingRequests: row?.pending_requests ?? 0 };
}

export async function fetchChatSettings(): Promise<ChatSettings> {
  const { data, error } = await supabase.rpc('get_chat_settings');
  if (error) onChatError('settings', error);
  const row = z.array(settingsRow).parse(data ?? [])[0];
  return { whoCanMessage: row?.who_can_message ?? 'everyone', showOnline: row?.show_online ?? true };
}

export async function setChatSettings(change: { who?: WhoCanMessage; showOnline?: boolean }): Promise<void> {
  const { error } = await supabase.rpc('set_chat_settings', {
    ...(change.who ? { p_who: change.who } : {}),
    ...(change.showOnline === undefined ? {} : { p_show_online: change.showOnline }),
  });
  if (error) onChatError('setSettings', error);
}

/** Returns the conversation id. */
export async function sendChatRequest(to: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_chat_request', { p_to: to, p_body: body.trim() });
  if (error) onChatError('sendRequest', error);
  return z.string().parse(data);
}

/**
 * Brings back an accepted chat I deleted for myself (my deleted history stays deleted). Never
 * creates a chat and never notifies the other member. Returns the conversation id.
 */
export async function reopenMyChat(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reopen_my_chat', { p_with: otherId });
  if (error) onChatError('reopen', error);
  return z.string().parse(data);
}

export async function respondChatRequest(conversationId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_chat_request', { p_conversation: conversationId, p_accept: accept });
  if (error) onChatError('respond', error);
}

/** Returns the new message id. */
export async function sendChatMessage(conversationId: string, body: string, replyTo: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_conversation: conversationId,
    p_body: body.trim(),
    ...(replyTo ? { p_reply_to: replyTo } : {}),
  });
  if (error) onChatError('send', error);
  return z.string().parse(data);
}

export async function deleteMyChatMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_chat_message', { p_message: messageId });
  if (error) onChatError('deleteMessage', error);
}

export async function markChatRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_chat_read', { p_conversation: conversationId });
  if (error) onChatError('markRead', error);
}

export async function setChatMuted(conversationId: string, muted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_chat_muted', { p_conversation: conversationId, p_muted: muted });
  if (error) onChatError('mute', error);
}

export async function deleteChatForMe(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_chat_for_me', { p_conversation: conversationId });
  if (error) onChatError('deleteChat', error);
}

const reactionRow = z.object({ message_id: z.string(), reaction: z.string(), reaction_count: z.number(), mine: z.boolean() });

/** Reactions on these messages of one chat: one call per 100 ids (chunks run together). */
export async function fetchMessageReactions(conversationId: string, messageIds: readonly string[]): Promise<ReactionRow[]> {
  const chunks = chunkIds(messageIds);
  const pages = await Promise.all(
    chunks.map(async (ids) => {
      const { data, error } = await supabase.rpc('get_message_reactions', { p_conversation: conversationId, p_message_ids: ids });
      if (error) onChatError('reactions', error);
      return z.array(reactionRow).parse(data ?? []);
    }),
  );
  return pages.flat();
}

/** Sets, replaces or (null) removes my reaction on one message. Silent: no notification. */
export async function reactToChatMessage(messageId: string, reaction: ReactionKey | null): Promise<void> {
  const { error } = await supabase.rpc('react_to_chat_message', {
    p_message: messageId,
    ...(reaction ? { p_reaction: reaction } : {}),
  });
  if (error) onChatError('react', error);
}

/**
 * Reports a chat (messageId null) or one of the other member's messages. The server copies the
 * evidence itself: only ids, the reason and the optional note are sent. Returns the report id.
 */
export async function reportChat(conversationId: string, messageId: string | null, reason: ChatReportReason, note: string): Promise<string> {
  const trimmed = note.trim();
  const { data, error } = await supabase.rpc('report_chat', {
    p_conversation: conversationId,
    // The SQL argument is nullable (null = the whole chat); the generator types it as string.
    p_message: messageId as string,
    p_reason: reason,
    ...(trimmed ? { p_note: trimmed } : {}),
  });
  if (error) onChatError('report', error);
  return z.string().parse(data);
}

/**
 * Closes an accepted chat for me only: it leaves my list and the other member can no longer send
 * to me in it (my history stays). Allowed while muted; undone by reopen_my_chat from their profile.
 */
export async function closeMyChat(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('close_my_chat', { p_conversation: conversationId });
  if (error) onChatError('close', error);
}

export async function sendChatHeartbeat(): Promise<void> {
  const { error } = await supabase.rpc('chat_heartbeat');
  if (error) onChatError('heartbeat', error);
}
