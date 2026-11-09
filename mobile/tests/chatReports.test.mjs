// Run with: npm run test:chatreports  (Node 22.6+ strips the TypeScript types of the import)
// Chat reports, member side: the server copies the evidence; staff review in the web panel only.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

register('./aliasHook.mjs', import.meta.url);

const R = await import('../lib/chatReports.ts');
const C = await import('../lib/chat.ts');
const { parsePushData, pushDestination, moderationQueuePath } = await import('../lib/pushNotifications.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ACCOUNT = { banned: 'This account has been banned.', suspended: 'S', nickname_required: 'N', not_authenticated: 'Please sign in first.', network: 'No connection.' };

// ---------------------------------------------------------------- reasons

test('six reasons with clear labels, matching the database list', () => {
  assert.deepEqual(
    R.CHAT_REPORT_REASONS.map((r) => [r.value, r.label]),
    [
      ['harassment', 'Harassment or bullying'],
      ['spam_scam', 'Spam or scam'],
      ['sexual_content', 'Sexual content'],
      ['threats', 'Threats or violence'],
      ['child_safety', 'Child safety'],
      ['other', 'Something else'],
    ],
  );
  const sql = read('../../supabase/migrations/20261107160000_chat_reports.sql');
  for (const r of R.CHAT_REPORT_REASONS) assert.match(sql, new RegExp(`'${r.value}'`), r.value);
  assert.equal(R.CHILD_SAFETY_LINE, 'Reports about child safety go straight to the admins.');
  assert.equal(R.CHAT_REPORT_NOTE_MAX, 300);
  assert.equal(R.noteTooLong('a'.repeat(300)), false);
  assert.equal(R.noteTooLong(` ${'a'.repeat(300)} `), false);
  assert.equal(R.noteTooLong('a'.repeat(301)), true);
});

test('the texts never promise what happens to the other member', () => {
  for (const text of [R.REPORT_FOLLOW_UP_TITLE, R.BLOCK_HELP, R.CLOSE_HELP, R.CHILD_SAFETY_LINE, ...R.CHAT_REPORT_REASONS.map((r) => r.label)]) {
    assert.doesNotMatch(text, /\b(ban|banned|blocked|removed|suspend|warn|they will|will be told)\b/i, text);
  }
});

// ---------------------------------------------------------------- which messages

test('only their messages: not mine, not deleted, not the waiting request, only sent', () => {
  const row = { mine: false, deleted: false, id: 'm1', status: 'sent' };
  assert.equal(R.canReportMessage(row), true);
  assert.equal(R.canReportMessage({ ...row, mine: true }), false);
  assert.equal(R.canReportMessage({ ...row, deleted: true }), false);
  assert.equal(R.canReportMessage({ ...row, id: null }), false, 'the waiting request bubble has no id');
  assert.equal(R.canReportMessage({ ...row, status: 'sending' }), false);
  assert.equal(R.canReportMessage({ ...row, status: 'failed' }), false);
});

// ---------------------------------------------------------------- errors

test('report errors: the brief texts, account wording, generic for the rest', () => {
  const t = (code) => C.chatErrorText(code, 'report', ACCOUNT).message;
  assert.equal(t('already_reported'), "You've already reported this chat. The moderators are reviewing it.");
  assert.equal(t('rate_limited'), "You've sent a lot of reports today. Please try again tomorrow.");
  assert.equal(t('note_too_long'), 'The note can be up to 300 characters.');
  assert.equal(t('banned'), ACCOUNT.banned);
  assert.equal(t('not_authenticated'), ACCOUNT.not_authenticated);
  assert.equal(t('network'), ACCOUNT.network);
  assert.equal(t('not_found'), "This chat isn't available.");
  assert.equal(C.chatErrorText('chat_disabled', 'report', ACCOUNT).action, 'disabled');
  assert.equal(t('invalid_reason'), "Couldn't send the report. Try again.");
  assert.equal(t(null), "Couldn't send the report. Try again.");
  assert.equal(t('something_new'), "Couldn't send the report. Try again.");
  for (const code of ['already_reported', 'note_too_long', 'invalid_reason']) assert.ok(C.CHAT_ERROR_CODES.includes(code), code);
  // Other contexts are unchanged.
  assert.equal(C.chatErrorText('rate_limited', 'message', ACCOUNT).message, "You're sending messages too fast. Wait a moment.");
});

// ---------------------------------------------------------------- staff push with no target

test('a staff_report push with no target (a chat report) opens the Moderation hub, never crashes', () => {
  const nid = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
  const data = parsePushData({ nid, type: 'staff_report', targetType: null, targetId: null });
  assert.deepEqual(data, { nid, type: 'staff_report', targetType: null, targetId: null });
  assert.deepEqual(pushDestination(data), { kind: 'moderation-queue', queue: 'hub' });
  assert.equal(moderationQueuePath('hub'), '/moderation');
  // With a target it still opens the reports queue.
  assert.deepEqual(pushDestination(parsePushData({ nid, type: 'staff_report', targetType: 'post', targetId: nid })), { kind: 'moderation-queue', queue: 'reports' });
  // The phone has no staff chat-report screen: chat reports are reviewed in the web panel.
  const files = readdirSync(join(root, 'app/moderation'), { recursive: true }).map(String);
  assert.ok(!files.some((f) => /chat/i.test(f)), files.join(','));
});

// ---------------------------------------------------------------- wiring, privacy, performance

test('the three entry points and one lazy sheet', () => {
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /label: 'Report message'/);
  assert.match(screen, /conversation && row\.id && canReportMessage\(row\)/);
  assert.match(screen, /label: 'Report chat'/);
  assert.match(screen, /setReportFor\(\{ conversationId: c\.id, messageId: null,/);
  assert.match(screen, /\{reportFor \? <ChatReportSheet target=\{reportFor\}/);
  const requests = read('../app/chat/requests.tsx');
  assert.match(requests, /label="Report"/);
  assert.match(requests, /setReportFor\(\{ conversationId: r\.id, messageId: null,/);
  assert.match(requests, /\{reportFor \? <ChatReportSheet/);
});

test('one RPC on Send, ids and reason only (no message text); every error inside the sheet; then the choices', () => {
  const api = read('../lib/chatApi.ts');
  const fn = api.slice(api.indexOf('export async function reportChat'), api.indexOf('export async function closeMyChat'));
  assert.match(fn, /supabase\.rpc\('report_chat', \{/);
  assert.doesNotMatch(fn, /body|text/i, 'never message text');
  assert.match(fn, /if \(error\) onChatError\('report', error\);/);
  const sheet = read('../components/chat/ChatReportSheet.tsx');
  assert.equal(sheet.split('reportChat(').length - 1, 1);
  assert.doesNotMatch(sheet, /useQuery|fetchQuery|logError|console\./);
  const send = sheet.slice(sheet.indexOf('const send = async'), sheet.indexOf('const closeChat = async'));
  assert.ok(send.indexOf('if (!reason || sending.current || tooLong) return;') >= 0, 'no double taps');
  assert.match(send, /setPhase\('choices'\);/);
  // Errors: an inline banner (a toast would sit behind the modal); the reason and note stay.
  assert.match(send, /setError\(getChatError\(e, 'report'\)\.message\);/);
  assert.doesNotMatch(send, /showToast/);
  assert.ok(sheet.indexOf('<FormMessage tone="error" message={error} />') < sheet.indexOf('label="Send"'), 'the banner sits above Send');
  // The reported member is never told and nothing in the lists changes.
  assert.doesNotMatch(sheet, /invalidateChatLists|setQueryData/);
});

// ---------------------------------------------------------------- after a report: three choices

test('choices: Block and Cancel always; Close this chat only for an accepted chat, never a request', () => {
  assert.equal(R.REPORT_FOLLOW_UP_TITLE, 'Report sent. What else would you like to do?');
  assert.deepEqual(R.reportFollowUps('chat').map((f) => f.key), ['block', 'close', 'cancel']);
  assert.deepEqual(R.reportFollowUps('request').map((f) => f.key), ['block', 'cancel']);
  const [block, close, cancel] = R.reportFollowUps('chat');
  assert.deepEqual([block.label, block.help], ['Block this user', "Hides everything from them, including their posts, and they can't message you."]);
  assert.deepEqual([close.label, close.help], ['Close this chat only', 'Stops messages from them in this chat. You can still see them elsewhere and reopen the chat from their profile.']);
  assert.deepEqual([cancel.label, cancel.help], ['Cancel', null]);
  assert.equal(R.CHAT_CLOSED, 'Chat closed. You can reopen it from their profile.');
  // Sources: the chat screen reports as 'chat', the Requests screen as 'request'.
  assert.match(read('../app/chat/[id].tsx'), /source: 'chat'/);
  assert.match(read('../app/chat/requests.tsx'), /source: 'request'/);
});

test('Block reuses the existing flow; Close calls close_my_chat once and leaves the chat', () => {
  const sheet = read('../components/chat/ChatReportSheet.tsx');
  assert.match(sheet, /block\(\{ id: target\.other\.id, nickname: target\.other\.nickname \}/);
  const close = sheet.slice(sheet.indexOf('const closeChat = async'), sheet.indexOf('const choose = '));
  assert.match(close, /await closeMyChat\(target\.conversationId\);/);
  assert.ok(close.indexOf('showToast(CHAT_CLOSED)') < close.indexOf('onChatClosed?.()'));
  assert.match(close, /setError\(getChatError\(e, 'close'\)\.message\);/);
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /onChatClosed=\{leave\}/);
  // The header menu offers it too, with the same explanation in a confirm.
  assert.match(screen, /label: 'Close chat'/);
  assert.match(screen, /Alert\.alert\('Close this chat\?', CLOSE_HELP/);
  const api = read('../lib/chatApi.ts');
  assert.match(api, /supabase\.rpc\('close_my_chat', \{ p_conversation: conversationId \}\);\s*if \(error\) onChatError\('close', error\);/);
});

test('close and "not accepting" errors', () => {
  const t = (code, ctx) => C.chatErrorText(code, ctx, ACCOUNT).message;
  assert.equal(t('not_found', 'close'), 'This chat is no longer available.');
  assert.equal(t('rate_limited', 'close'), "Couldn't close the chat. Try again.");
  assert.equal(t('suspended', 'close'), "Couldn't close the chat. Try again.", 'muted members can close; a refusal reads as a failure');
  assert.equal(t(null, 'close'), "Couldn't close the chat. Try again.");
  assert.equal(t('not_accepting_messages', 'message'), "This member isn't accepting messages in this chat.");
  assert.equal(t('not_accepting_messages', 'request'), "This member isn't accepting messages.", 'a request still means "nobody can message me"');
  // The Message button's reopen path uses the in-chat text.
  assert.match(read('../hooks/useFirstMessage.ts'), /return failed\(reopenError, 'message'\);/);
});

// ---------------------------------------------------------------- the compact sheet

test('compact layout while the note is being typed (no keyboard measuring)', () => {
  assert.equal(R.compactLayout({ noteFocused: false, keyboardShown: false }), false);
  assert.equal(R.compactLayout({ noteFocused: true, keyboardShown: false }), true);
  assert.equal(R.compactLayout({ noteFocused: false, keyboardShown: true }), true);
  const sheet = read('../components/chat/ChatReportSheet.tsx');
  assert.doesNotMatch(sheet, /endCoordinates|keyboardVerticalOffset|useKeyboardHeight/, 'no heights or offsets');
  assert.match(sheet, /\{compact \? \(\s*<Pressable\s+onPress=\{expandReasons\}/);
  assert.match(sheet, /show\.remove\(\);\s*hide\.remove\(\);/);
  assert.match(sheet, /\{compact \? null : <Button label="Cancel"/);
});

// ---------------------------------------------------------------- the hub card

test('hub card: N open, none, or no number when loading or failed; staff only', async () => {
  const M = await import('../lib/moderation.ts');
  assert.equal(M.chatReportCardValue(3), '3 open');
  assert.equal(M.chatReportCardValue(0), 'No open chat reports');
  assert.equal(M.chatReportCardValue(undefined), null);
  assert.equal(M.CHAT_REPORTS_LINE, 'Review them in the admin web panel.');
  const hook = read('../hooks/useOpenChatReportCount.ts');
  assert.match(hook, /queryFn: isStaff \? fetchOpenChatReportCount : skipToken/);
  const hub = read('../app/moderation/index.tsx');
  assert.match(hub, /value=\{chatReportCardValue\(chatReports\.data\) \?\? undefined\}/);
  assert.doesNotMatch(hub.slice(hub.indexOf('label="Chat reports"') - 200, hub.indexOf('label="Chat reports"') + 200), /onPress/, 'no navigation to a report');
  assert.match(read('../lib/auth.ts'), /'mod-chat-reports-open'/);
});
