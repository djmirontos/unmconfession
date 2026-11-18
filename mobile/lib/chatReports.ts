// Chat reports, member side (20261107160000_chat_reports.sql). Pure, no imports
// (tests/chatReports.test.mjs). The server copies the evidence itself: the app sends the chat id,
// an optional message id, a reason and an optional note, never message text. Staff review chat
// reports in the admin web panel only; the reported member is never told.

export const CHAT_REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam_scam', label: 'Spam or scam' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'threats', label: 'Threats or violence' },
  { value: 'child_safety', label: 'Child safety' },
  { value: 'other', label: 'Something else' },
] as const;
export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number]['value'];

export const CHAT_REPORT_NOTE_MAX = 300;
export const CHILD_SAFETY_LINE = 'Reports about child safety go straight to the admins.';

/** What is being reported: the whole chat (or a request I received), or one of their messages. */
export type ChatReportTarget = {
  conversationId: string;
  /** null: the whole chat or request. */
  messageId: string | null;
  /** The other member, for the offers after sending. */
  other: { id: string; nickname: string };
  /** An accepted chat (a message or the whole chat) or a request I received. */
  source: 'chat' | 'request';
};

// ---------------------------------------------------------------- after a report: three choices

export const REPORT_FOLLOW_UP_TITLE = 'Report sent. The moderators will review it.';
export const BLOCK_HELP = 'Stops all contact.';
/** The full explanation, kept for the chat menu's "Close chat" confirm. */
export const CLOSE_HELP = 'Stops messages from them in this chat. You can still see them elsewhere and reopen the chat from their profile.';
export const CLOSE_CHOICE_HELP = 'You can reopen it later.';
export const CHAT_CLOSED = 'Chat closed. You can reopen it from their profile.';

export type FollowUp = { key: 'block' | 'close' | 'cancel'; label: string; help: string | null };

/** "Block <name>", or "Block this person" when there is no usable nickname. */
export const blockLabel = (nickname: string | null | undefined): string => `Block ${nickname?.trim() || 'this person'}`;

/** Keep chat open (dismiss), Close this chat (accepted chats only, never a request), then Block last. */
export function reportFollowUps(source: ChatReportTarget['source'], nickname: string | null | undefined): FollowUp[] {
  return [
    { key: 'cancel', label: 'Keep chat open', help: null },
    ...(source === 'chat' ? [{ key: 'close' as const, label: 'Close this chat', help: CLOSE_CHOICE_HELP }] : []),
    { key: 'block', label: blockLabel(nickname), help: BLOCK_HELP },
  ];
}

// ---------------------------------------------------------------- the form

/** Shown above Send (and as its accessibility hint) until a reason is chosen. */
export const REASON_HINT = 'Choose a reason to send your report.';

/** The hint line: only with no reason, and not in the compact layout (that keeps Send above the keyboard). */
export const showReasonHint = (s: { reason: string | null; compact: boolean }): boolean => s.reason === null && !s.compact;

/**
 * The sheet's compact layout: while the note is being typed (focused, or the keyboard is up) the
 * reasons hide behind one line, so the note, its counter and Send fit above the keyboard without
 * measuring anything.
 */
export const compactLayout = (s: { noteFocused: boolean; keyboardShown: boolean }): boolean => s.noteFocused || s.keyboardShown;

/** A message I can report: theirs, stored on the server, sent and not deleted (never the waiting request). */
export function canReportMessage(row: { mine: boolean; deleted: boolean; id: string | null; status: string }): boolean {
  return !row.mine && !row.deleted && row.id !== null && row.status === 'sent';
}

/** A note over the limit stays in the sheet with this line (the server refuses it as note_too_long). */
export const noteTooLong = (note: string): boolean => note.trim().length > CHAT_REPORT_NOTE_MAX;
