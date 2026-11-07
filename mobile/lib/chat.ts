// 1:1 chat (v1.0.5, stage 2: text only). Pure rules, no imports, tested with plain Node
// (tests/chat.test.mjs). The database (20261105100000_chat_core.sql) enforces every rule again.
//
// Privacy: nothing here logs, stores or navigates with message text. Query keys carry the user id
// and the conversation id only, under the 'chat' root, which is never persisted and is cleared on
// logout and account deletion (lib/auth.ts).

// ---------------------------------------------------------------- the gate

export type ChatMode = 'off' | 'staff' | 'on';
export const CHAT_MODES: readonly ChatMode[] = ['off', 'staff', 'on'];
export const isChatMode = (value: unknown): value is ChatMode => CHAT_MODES.includes(value as ChatMode);

export type Membership = 'guest' | 'loading' | 'error' | 'needs-nickname' | 'member';

/**
 * Whether chat is on for this viewer. Only full members; 'staff' only for staff; a failed or
 * missing read is 'off'. Guests never: they get the sign-in prompt where an action needs it.
 */
export function resolveChatAccess(input: { membership: Membership; mode: ChatMode | null; readFailed: boolean; isStaff: boolean }): boolean {
  if (input.membership !== 'member' || input.readFailed || input.mode === null) return false;
  if (input.mode === 'on') return true;
  if (input.mode === 'staff') return input.isStaff;
  return false;
}

// ---------------------------------------------------------------- query keys

/** Every chat cache lives under this root: one removeQueries clears them all. */
export const CHAT_KEY_ROOT = 'chat';
export const chatKeys = {
  mode: (userId: string) => [CHAT_KEY_ROOT, userId, 'mode'] as const,
  conversations: (userId: string) => [CHAT_KEY_ROOT, userId, 'conversations'] as const,
  requests: (userId: string) => [CHAT_KEY_ROOT, userId, 'requests'] as const,
  unread: (userId: string) => [CHAT_KEY_ROOT, userId, 'unread'] as const,
  settings: (userId: string) => [CHAT_KEY_ROOT, userId, 'settings'] as const,
  messages: (userId: string, conversationId: string) => [CHAT_KEY_ROOT, userId, 'messages', conversationId] as const,
  reactions: (userId: string, conversationId: string) => [CHAT_KEY_ROOT, userId, 'reactions', conversationId] as const,
};

// ---------------------------------------------------------------- limits and timers

export const REQUEST_MAX = 200;
export const MESSAGE_MAX = 2000;
/** The message counter shows from here. */
export const MESSAGE_COUNTER_FROM = 1800;
export const MESSAGE_PAGE_SIZE = 30;
export const MESSAGES_POLL_MS = 20_000;
export const LIST_POLL_MS = 30_000;
export const HEARTBEAT_MS = 60_000;
export const GATE_STALE_MS = 60_000;

/** Timers run only while their screen is focused, the app is in the foreground and chat is on. */
export function pollInterval(kind: 'messages' | 'list', state: { focused: boolean; appActive: boolean; enabled: boolean }): number | false {
  if (!state.focused || !state.appActive || !state.enabled) return false;
  return kind === 'messages' ? MESSAGES_POLL_MS : LIST_POLL_MS;
}

/** The "I'm active" ping: only while chat is on and the app is in the foreground. */
export const heartbeatActive = (enabled: boolean, appActive: boolean): boolean => enabled && appActive;

// ---------------------------------------------------------------- input checks (the DB checks again)

export type BodyCheck = 'ok' | 'body_required' | 'body_too_long';

export function checkBody(text: string, max: number): BodyCheck {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'body_required';
  if (trimmed.length > max) return 'body_too_long';
  return 'ok';
}

// ---------------------------------------------------------------- error codes -> text

/** Every code the chat functions raise (the Postgres error message is exactly the code). */
export const CHAT_ERROR_CODES = [
  'chat_disabled',
  'not_found',
  'cannot_message_self',
  'body_required',
  'body_too_long',
  'not_accepting_messages',
  'message_not_allowed',
  'contact_info_not_allowed',
  'request_pending',
  'request_incoming',
  'already_chatting',
  'request_cooldown',
  'request_limit',
  'recipient_unavailable',
  'rate_limited',
  'invalid_reply',
  'invalid_input',
  'invalid_reaction',
  'banned',
  'suspended',
  'nickname_required',
  'not_authenticated',
] as const;

/** Where the error happened: the same code reads differently (a gone request vs a gone member). */
export type ChatErrorContext = 'request' | 'respond' | 'message' | 'chat' | 'react';

/** 'requests': offer to open the Requests screen. 'disabled': chat was switched off, hide it. */
export type ChatErrorAction = 'requests' | 'disabled' | null;

const CANNOT_MESSAGE = "This member can't be messaged right now.";
const FALLBACK = 'Something went wrong. Please try again.';

const CHAT_TEXT: Record<string, string> = {
  chat_disabled: "Chats aren't available right now.",
  cannot_message_self: "You can't message yourself.",
  body_required: 'Write a message first.',
  not_accepting_messages: "This member isn't accepting messages.",
  message_not_allowed: "This message can't be sent.",
  contact_info_not_allowed: "Links, email addresses and phone numbers can't be included in a first message.",
  request_pending: 'Request sent, waiting for a reply.',
  request_incoming: 'This member already sent you a request. Open Requests to answer it.',
  already_chatting: "You're already chatting with this member.",
  request_cooldown: 'You can ask this member again in a few days.',
  request_limit: "You've reached today's limit for new requests. Try again tomorrow.",
  recipient_unavailable: CANNOT_MESSAGE,
  rate_limited: "You're sending messages too fast. Wait a moment.",
  invalid_reply: "The message you're replying to is no longer available.",
  invalid_input: FALLBACK,
};

// not_found never says why (blocked, banned, deleted or gone all look the same).
const NOT_FOUND: Record<ChatErrorContext, string> = {
  request: CANNOT_MESSAGE,
  message: CANNOT_MESSAGE,
  respond: 'This request is no longer available.',
  chat: "This chat isn't available.",
  react: 'This message is no longer available.',
};

const TOO_LONG: Record<ChatErrorContext, string> = {
  request: `Keep the first message to ${REQUEST_MAX} characters.`,
  message: 'Messages can be up to 2,000 characters.',
  respond: FALLBACK,
  chat: FALLBACK,
  react: FALLBACK,
};

/** Account states keep the app's usual wording (passed in from lib/errors.ts). */
export type AccountTexts = { banned: string; suspended: string; nickname_required: string; not_authenticated: string; network: string };

/**
 * The one mapping from a chat error code to friendly English. `code` is null for an unknown error,
 * 'network' when the request never reached the server. Unknown codes get the safe default.
 */
export function chatErrorText(
  code: string | null,
  context: ChatErrorContext,
  account: AccountTexts,
): { message: string; action: ChatErrorAction } {
  if (code === 'chat_disabled') return { message: CHAT_TEXT.chat_disabled ?? FALLBACK, action: 'disabled' };
  if (code === 'request_incoming') return { message: CHAT_TEXT.request_incoming ?? FALLBACK, action: 'requests' };
  if (code === 'not_found') return { message: NOT_FOUND[context], action: null };
  if (context === 'react' && code === 'rate_limited') return { message: 'Slow down a little.', action: null };
  if (code === 'body_too_long') return { message: TOO_LONG[context], action: null };
  if (code === 'banned' || code === 'suspended' || code === 'nickname_required' || code === 'not_authenticated' || code === 'network') {
    return { message: account[code], action: null };
  }
  const text = code ? CHAT_TEXT[code] : undefined;
  return { message: text ?? FALLBACK, action: null };
}

// ---------------------------------------------------------------- rows from the server

export type Conversation = {
  id: string;
  status: 'accepted' | 'pending_sent';
  otherId: string;
  otherNickname: string;
  otherAvatarKey: string | null;
  /** null = the last message was deleted, or nothing to show (cleared). */
  lastBody: string | null;
  lastAt: string | null;
  lastSender: string | null;
  unread: number;
  muted: boolean;
  /** true = online; false = not; null = hidden by them, or a pending request. */
  isOnline: boolean | null;
};

export type ChatRequest = { id: string; fromId: string; fromNickname: string; fromAvatarKey: string | null; body: string; requestedAt: string };

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string | null;
  replyToId: string | null;
  replyBody: string | null;
  replySenderId: string | null;
  createdAt: string;
  deleted: boolean;
};

// ---------------------------------------------------------------- the list

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The single preview line of a list row. */
export function conversationPreview(c: Conversation, myId: string): string {
  if (c.status === 'pending_sent') return 'Request sent';
  if (c.lastSender === null) return 'No messages yet';
  const text = c.lastBody === null ? 'Message deleted' : oneLine(c.lastBody);
  return c.lastSender === myId ? `You: ${text}` : text;
}

const timeOf = (iso: string | null): number => (iso ? Date.parse(iso) : 0);

/** Newest activity first; equal times by id so the order never jumps. */
export function sortConversations(list: readonly Conversation[]): Conversation[] {
  return [...list].sort((a, b) => timeOf(b.lastAt) - timeOf(a.lastAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The Chats tab badge: chats with something unread plus requests waiting; nothing at 0. */
export function chatBadge(counts: { unreadChats: number; pendingRequests: number } | null | undefined): number | undefined {
  const total = (counts?.unreadChats ?? 0) + (counts?.pendingRequests ?? 0);
  return total > 0 ? total : undefined;
}

// ---------------------------------------------------------------- "Message" on a profile

export type StartChat = { kind: 'open'; conversationId: string } | { kind: 'pending'; conversationId: string } | { kind: 'incoming' } | { kind: 'new' };

/** An existing conversation wins over a new request: open it (accepted or my pending request) or go to Requests. */
export function existingChatAction(conversations: readonly Conversation[], requests: readonly ChatRequest[], otherId: string): StartChat {
  const mine = conversations.find((c) => c.otherId === otherId);
  if (mine?.status === 'accepted') return { kind: 'open', conversationId: mine.id };
  if (mine?.status === 'pending_sent') return { kind: 'pending', conversationId: mine.id };
  if (requests.some((r) => r.fromId === otherId)) return { kind: 'incoming' };
  return { kind: 'new' };
}

// ---------------------------------------------------------------- messages: paging and polling

/** Newest first, as the server orders them: (created_at desc, id desc). */
export function compareNewestFirst(a: Pick<ChatMessage, 'createdAt' | 'id'>, b: Pick<ChatMessage, 'createdAt' | 'id'>): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export type Cursor = { at: string; id: string };

/** The next (older) page's cursor, or undefined at the start of the chat. */
export function olderCursor(lastPage: readonly ChatMessage[], pageSize = MESSAGE_PAGE_SIZE): Cursor | undefined {
  const last = lastPage[lastPage.length - 1];
  return lastPage.length >= pageSize && last ? { at: last.createdAt, id: last.id } : undefined;
}

/**
 * A poll brought the newest page. It replaces the same messages in the cache (a deletion shows) and
 * adds new ones to the first page. If it has no overlap with what is cached (more than a page arrived
 * since), the cache restarts from it so no gap is ever shown; older pages load again on scroll.
 */
export function mergeLatestPage(pages: readonly (readonly ChatMessage[])[], latest: readonly ChatMessage[], pageSize = MESSAGE_PAGE_SIZE): ChatMessage[][] {
  if (pages.length === 0) return [[...latest]];
  const cached = pages.flat();
  const oldestLatest = latest[latest.length - 1];
  const newestCached = cached[0];
  if (
    latest.length >= pageSize &&
    oldestLatest &&
    newestCached &&
    !cached.some((m) => m.id === oldestLatest.id) &&
    compareNewestFirst(oldestLatest, newestCached) < 0
  ) {
    return [[...latest]];
  }
  const fresh = new Set(latest.map((m) => m.id));
  const first = [...latest, ...(pages[0] ?? []).filter((m) => !fresh.has(m.id))].sort(compareNewestFirst);
  return [first, ...pages.slice(1).map((page) => page.filter((m) => !fresh.has(m.id)))];
}

/** Puts one message in (or replaces it), e.g. right after it was sent or deleted. */
export function upsertMessage(pages: readonly (readonly ChatMessage[])[], message: ChatMessage): ChatMessage[][] {
  const at = pages.findIndex((page) => page.some((m) => m.id === message.id));
  if (at >= 0) return pages.map((page, i) => (i === at ? page.map((m) => (m.id === message.id ? message : m)) : [...page]));
  return mergeLatestPage(pages, [message], Number.POSITIVE_INFINITY);
}

/** Deleting your own message: the text goes at once, a stub stays. */
export const asDeleted = (m: ChatMessage): ChatMessage => ({ ...m, body: null, deleted: true });

// ---------------------------------------------------------------- sending (in memory only)

export type ReplyRef = { id: string; body: string | null; senderId: string };

export type Outgoing = {
  localId: string;
  body: string;
  replyTo: ReplyRef | null;
  status: 'sending' | 'failed';
  /** Friendly text of the last failure. */
  error: string | null;
  createdAt: number;
};

export type OutboxAction =
  | { type: 'add'; item: Outgoing }
  | { type: 'retry'; localId: string }
  | { type: 'failed'; localId: string; error: string }
  | { type: 'remove'; localId: string };

/** sending -> (sent: removed) | failed; failed -> retry (sending) | remove. Unknown ids change nothing. */
export function outboxReduce(list: readonly Outgoing[], action: OutboxAction): Outgoing[] {
  switch (action.type) {
    case 'add':
      return [...list, action.item];
    case 'retry':
      return list.map((o) => (o.localId === action.localId && o.status === 'failed' ? { ...o, status: 'sending', error: null } : o));
    case 'failed':
      return list.map((o) => (o.localId === action.localId ? { ...o, status: 'failed', error: action.error } : o));
    case 'remove':
      return list.filter((o) => o.localId !== action.localId);
  }
}

// ---------------------------------------------------------------- replies

export type ReplyPreview = { label: string; text: string; deleted: boolean };

/**
 * The quote inside a bubble. null when the message answers nothing. A null reply body means the
 * original was deleted (or is no longer shown to this member): "Deleted message".
 */
export function replyPreview(
  m: Pick<ChatMessage, 'replyToId' | 'replyBody' | 'replySenderId'>,
  myId: string,
  otherNickname: string,
): ReplyPreview | null {
  if (m.replyToId === null) return null;
  if (m.replyBody === null) return { label: '', text: 'Deleted message', deleted: true };
  return { label: m.replySenderId === myId ? 'You' : otherNickname, text: oneLine(m.replyBody), deleted: false };
}

// ---------------------------------------------------------------- bubbles: grouping and day lines

/** Consecutive messages of one sender within this gap share a group (tighter spacing, one time). */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export type BubbleItem = {
  key: string;
  /** Server id, or null while it is only on this phone. */
  id: string | null;
  localId: string | null;
  senderId: string;
  body: string | null;
  deleted: boolean;
  reply: Pick<ChatMessage, 'replyToId' | 'replyBody' | 'replySenderId'>;
  at: number;
  status: 'sent' | 'sending' | 'failed';
  error: string | null;
};

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | (BubbleItem & { kind: 'message'; mine: boolean; firstInGroup: boolean; lastInGroup: boolean });

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "Today", "Yesterday", then a short date (with the year when it is not this year). Local time. */
export function dayLabel(ms: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function serverBubble(m: ChatMessage): BubbleItem {
  return {
    key: m.id,
    id: m.id,
    localId: null,
    senderId: m.senderId,
    body: m.body,
    deleted: m.deleted,
    reply: { replyToId: m.replyToId, replyBody: m.replyBody, replySenderId: m.replySenderId },
    at: Date.parse(m.createdAt),
    status: 'sent',
    error: null,
  };
}

export function outgoingBubble(o: Outgoing, myId: string): BubbleItem {
  return {
    key: o.localId,
    id: null,
    localId: o.localId,
    senderId: myId,
    body: o.body,
    deleted: false,
    reply: { replyToId: o.replyTo?.id ?? null, replyBody: o.replyTo?.body ?? null, replySenderId: o.replyTo?.senderId ?? null },
    at: o.createdAt,
    status: o.status,
    error: o.error,
  };
}

/**
 * Rows for an inverted list (index 0 = newest, drawn at the bottom): the messages newest first,
 * unsent ones on top of them, a day line after the oldest message of each day (so it is drawn
 * above that day), and group flags. "First" and "last" are in reading order (top to bottom).
 */
export function buildChatRows(server: readonly ChatMessage[], outgoing: readonly Outgoing[], myId: string, now: number): ChatRow[] {
  const items: BubbleItem[] = [
    ...[...outgoing].sort((a, b) => b.createdAt - a.createdAt).map((o) => outgoingBubble(o, myId)),
    ...server.map(serverBubble),
  ];
  const rows: ChatRow[] = [];
  items.forEach((item, i) => {
    const newer = items[i - 1];
    const older = items[i + 1];
    const sameDay = (a: BubbleItem | undefined) => a !== undefined && startOfDay(a.at) === startOfDay(item.at);
    const joins = (a: BubbleItem | undefined) => a !== undefined && a.senderId === item.senderId && sameDay(a) && Math.abs(a.at - item.at) <= GROUP_GAP_MS;
    rows.push({ ...item, kind: 'message', mine: item.senderId === myId, firstInGroup: !joins(older), lastInGroup: !joins(newer) });
    if (!sameDay(older)) rows.push({ kind: 'day', key: `day:${item.key}`, label: dayLabel(item.at, now) });
  });
  return rows;
}

/** The newest message that came from the server (marks the chat read when it changes). */
export const newestServerId = (server: readonly ChatMessage[]): string | null => server[0]?.id ?? null;

// ---------------------------------------------------------------- reopening a chat I deleted (stage 2b)

/**
 * After a request fails: already_chatting means the chat exists but this member deleted it for
 * themselves (it is hidden from their list), so reopen it, once. Anything else is shown as is.
 */
export function afterRequestFailure(code: string | null, alreadyReopened: boolean): 'reopen' | 'show' {
  return code === 'already_chatting' && !alreadyReopened ? 'reopen' : 'show';
}

// ---------------------------------------------------------------- starting a chat on the chat page

/** Where "Message" on a profile goes: always a chat page (or Requests for their request to me). */
export type StartRoute =
  | { kind: 'chat'; conversationId: string }
  | { kind: 'requests' }
  | { kind: 'new'; memberId: string };

export function startRoute(next: StartChat, memberId: string): StartRoute {
  if (next.kind === 'open' || next.kind === 'pending') return { kind: 'chat', conversationId: next.conversationId };
  if (next.kind === 'incoming') return { kind: 'requests' };
  return { kind: 'new', memberId };
}

/** The open chat page: waiting for the list, a request I sent (read-only), a normal chat, or gone. */
export type ChatPageState = 'loading' | 'pending' | 'accepted' | 'missing';

export function chatPageState(input: { routeValid: boolean; listLoaded: boolean; listFetching: boolean; conversation: Conversation | null }): ChatPageState {
  if (!input.routeValid) return 'missing';
  if (input.conversation) return input.conversation.status === 'pending_sent' ? 'pending' : 'accepted';
  if (!input.listLoaded || input.listFetching) return 'loading';
  return 'missing';
}

/**
 * A chat that was on screen and then left the list (declined, blocked, deleted): go back to the
 * list quietly. A link to a chat never seen shows "not available" instead.
 */
export const leaveQuietly = (seenBefore: boolean, state: ChatPageState): boolean => seenBefore && state === 'missing';

export const pendingBanner = (nickname: string) => `Waiting for ${nickname} to accept. You can send more messages once they accept.`;
export const PENDING_COMPOSER_REASON = 'You can send more messages once they accept.';
export const newChatHint = (nickname: string) => `Send a short message to ask ${nickname} to chat. They need to accept first.`;

/** After the first message is sent: the same page becomes /chat/<id> (replace, not push). */
export const firstMessageRoute = (conversationId: string) => ({ pathname: '/chat/[id]' as const, params: { id: conversationId } });

/** The list row a just-sent request shows as, until the next list refresh brings the stored one. */
export function pendingConversation(input: {
  conversationId: string;
  other: { id: string; nickname: string; avatarKey: string | null };
  body: string;
  myId: string;
  sentAt: string;
}): Conversation {
  return {
    id: input.conversationId,
    status: 'pending_sent',
    otherId: input.other.id,
    otherNickname: input.other.nickname,
    otherAvatarKey: input.other.avatarKey,
    lastBody: input.body.trim(),
    lastAt: input.sentAt,
    lastSender: input.myId,
    unread: 0,
    muted: false,
    isOnline: null,
  };
}

/** Puts a row in the list (replacing one with the same id), newest first. */
export const withConversation = (list: readonly Conversation[] | undefined, row: Conversation): Conversation[] =>
  sortConversations([row, ...(list ?? []).filter((c) => c.id !== row.id)]);

/** The request text shown as my one bubble on the pending page (it has no message id yet). */
export function pendingRows(c: Conversation, myId: string, now: number): ChatRow[] {
  if (c.lastBody === null || c.lastAt === null) return [];
  const message: ChatMessage = {
    id: `request:${c.id}`,
    senderId: myId,
    body: c.lastBody,
    replyToId: null,
    replyBody: null,
    replySenderId: null,
    createdAt: c.lastAt,
    deleted: false,
  };
  // No server id: no reply, no delete; it only shows what was sent.
  return buildChatRows([message], [], myId, now).map((r) => (r.kind === 'message' ? { ...r, id: null } : r));
}
