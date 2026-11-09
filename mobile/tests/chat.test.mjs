// Run with: npm run test:chat  (Node 22.6+ strips the TypeScript types of the import)
// 1:1 chat, stage 2 (app side, text only): pure rules and source scans.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const C = await import('../lib/chat.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Every app source file (relative path -> text), types excluded. */
function sources() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) out.set(rel, readFileSync(join(root, rel), 'utf8'));
    }
  };
  for (const d of ['app', 'components', 'hooks', 'lib', 'stores']) walk(d);
  return out;
}
const SRC = sources();
const CHAT_FILES = [...SRC.keys()].filter((p) => /chat/i.test(p));

const ACCOUNT = {
  banned: 'This account has been banned.',
  suspended: 'This account is suspended for now. Try again later.',
  nickname_required: 'Choose a nickname before you take part.',
  not_authenticated: 'Please sign in first.',
  network: 'No connection. Check your internet and try again.',
};
const CONTEXTS = ['request', 'respond', 'message', 'chat'];

// ---------------------------------------------------------------- error codes

test('every code from the brief is known and has friendly text (never the raw code)', () => {
  const brief = [
    'chat_disabled', 'not_found', 'cannot_message_self', 'body_required', 'body_too_long', 'not_accepting_messages',
    'message_not_allowed', 'contact_info_not_allowed', 'request_pending', 'request_incoming', 'already_chatting',
    'request_cooldown', 'request_limit', 'recipient_unavailable', 'rate_limited', 'invalid_reply', 'banned', 'suspended',
    'nickname_required', 'not_authenticated',
  ];
  for (const code of brief) {
    assert.ok(C.CHAT_ERROR_CODES.includes(code), code);
    for (const ctx of CONTEXTS) {
      const { message } = C.chatErrorText(code, ctx, ACCOUNT);
      assert.ok(message.length > 10, `${code}/${ctx}`);
      assert.doesNotMatch(message, /_/, `${code}/${ctx} shows a raw code`);
    }
  }
});

test('the exact wording the brief asks for', () => {
  const t = (code, ctx = 'request') => C.chatErrorText(code, ctx, ACCOUNT).message;
  assert.equal(t('not_found'), "This member can't be messaged right now.");
  assert.equal(t('not_found', 'message'), "This member can't be messaged right now.");
  assert.equal(t('not_accepting_messages'), "This member isn't accepting messages.");
  assert.equal(t('request_cooldown'), 'You can ask this member again in a few days.');
  assert.equal(t('request_limit'), "You've reached today's limit for new requests. Try again tomorrow.");
  assert.equal(t('contact_info_not_allowed'), "Links, email addresses and phone numbers can't be included in a first message.");
  assert.equal(t('message_not_allowed'), "This message can't be sent.");
  assert.equal(t('rate_limited', 'message'), "You're sending messages too fast. Wait a moment.");
});

test('request_incoming offers Requests; chat_disabled hides chat; the rest offer nothing', () => {
  assert.equal(C.chatErrorText('request_incoming', 'request', ACCOUNT).action, 'requests');
  assert.equal(C.chatErrorText('chat_disabled', 'message', ACCOUNT).action, 'disabled');
  assert.equal(C.chatErrorText('request_limit', 'request', ACCOUNT).action, null);
});

test('account states and no connection keep the app wording', () => {
  for (const code of ['banned', 'suspended', 'nickname_required', 'not_authenticated', 'network']) {
    assert.equal(C.chatErrorText(code, 'message', ACCOUNT).message, ACCOUNT[code]);
  }
});

test('unknown errors get the safe default', () => {
  assert.equal(C.chatErrorText(null, 'message', ACCOUNT).message, 'Something went wrong. Please try again.');
  assert.equal(C.chatErrorText('some_new_code', 'chat', ACCOUNT).message, 'Something went wrong. Please try again.');
});

test('no message ever reveals a block', () => {
  for (const code of [...C.CHAT_ERROR_CODES, null, 'network', 'whatever']) {
    for (const ctx of CONTEXTS) assert.doesNotMatch(C.chatErrorText(code, ctx, ACCOUNT).message, /block/i, `${code}/${ctx}`);
  }
});

test('lib/errors.ts registers the chat codes and is the single entry point', () => {
  const src = read('../lib/errors.ts');
  assert.match(src, /\.\.\.CHAT_ERROR_CODES,/);
  assert.match(src, /export function getChatError\(error: unknown, context: ChatErrorContext\)/);
  // Screens never call chatErrorText directly.
  for (const [path, text] of SRC) if (path !== 'lib/errors.ts' && path !== 'lib/chat.ts') assert.doesNotMatch(text, /chatErrorText\(/, path);
});

// ---------------------------------------------------------------- the gate

test('gate: off / staff / on x staff / member / guest / read failure', () => {
  const g = (membership, mode, isStaff, readFailed = false) => C.resolveChatAccess({ membership, mode, isStaff, readFailed });
  for (const staff of [true, false]) {
    assert.equal(g('member', 'off', staff), false);
    assert.equal(g('member', 'on', staff), true);
    assert.equal(g('member', 'on', staff, true), false, 'a failed read is off');
    assert.equal(g('member', null, staff), false, 'not read yet is off');
    for (const m of ['guest', 'loading', 'error', 'needs-nickname']) {
      for (const mode of ['off', 'staff', 'on']) assert.equal(g(m, mode, staff), false, `${m}/${mode}`);
    }
  }
  assert.equal(g('member', 'staff', true), true);
  assert.equal(g('member', 'staff', false), false);
  assert.equal(g('member', 'staff', true, true), false);
  assert.equal(C.isChatMode('on'), true);
  assert.equal(C.isChatMode('ON'), false);
  assert.equal(C.isChatMode(null), false);
});

// ---------------------------------------------------------------- polling and heartbeat

test('timers only while focused, active and on', () => {
  for (const kind of ['messages', 'list']) {
    for (const focused of [true, false]) for (const appActive of [true, false]) for (const enabled of [true, false]) {
      const v = C.pollInterval(kind, { focused, appActive, enabled });
      if (focused && appActive && enabled) assert.equal(v, kind === 'messages' ? 20_000 : 30_000);
      else assert.equal(v, false);
    }
  }
  assert.equal(C.heartbeatActive(true, true), true);
  assert.equal(C.heartbeatActive(true, false), false);
  assert.equal(C.heartbeatActive(false, true), false);
  assert.equal(C.HEARTBEAT_MS, 60_000);
  assert.equal(C.GATE_STALE_MS, 60_000);
});

test('hooks wire the rules: interval cleared on blur/background, heartbeat stops when off', () => {
  const msgs = read('../hooks/useChatMessages.ts');
  assert.match(msgs, /if \(!live \|\| pollMs === false\) return;\s*const timer = setInterval\(\(\) => void pollLatest\(\), pollMs\);\s*return \(\) => clearInterval\(timer\);/);
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /pollInterval\('messages', \{ focused: isFocused, appActive, enabled: ready \}\)/);
  const list = read('../components/chat/ChatList.tsx');
  assert.match(list, /pollInterval\('list', \{ focused: isFocused, appActive, enabled: true \}\)/);
  const session = read('../hooks/useChatSession.ts');
  assert.match(session, /const beating = heartbeatActive\(enabled, appActive\);/);
  assert.match(session, /if \(!beating\) return;[\s\S]*return \(\) => clearInterval\(timer\);/);
  assert.match(read('../app/_layout.tsx'), /useChatSession\(\);/);
});

// ---------------------------------------------------------------- the list

const conv = (over) => ({
  id: 'c1', status: 'accepted', otherId: 'o', otherNickname: 'kai', otherAvatarKey: null, lastBody: 'hi',
  lastAt: '2026-11-05T10:00:00Z', lastSender: 'o', unread: 0, muted: false, isOnline: null, ...over,
});

test('preview line: You: prefix, deleted, pending, nothing yet, one line', () => {
  assert.equal(C.conversationPreview(conv({}), 'me'), 'hi');
  assert.equal(C.conversationPreview(conv({ lastSender: 'me', lastBody: 'yo' }), 'me'), 'You: yo');
  assert.equal(C.conversationPreview(conv({ lastBody: null }), 'me'), 'Message deleted');
  assert.equal(C.conversationPreview(conv({ status: 'pending_sent' }), 'me'), 'Request sent');
  assert.equal(C.conversationPreview(conv({ lastBody: null, lastSender: null }), 'me'), 'No messages yet');
  assert.equal(C.conversationPreview(conv({ lastBody: 'a\n\n  b' }), 'me'), 'a b');
});

test('list order: newest activity first, ties by id, stable', () => {
  const list = [
    conv({ id: 'b', lastAt: '2026-11-05T09:00:00Z' }),
    conv({ id: 'a', lastAt: '2026-11-05T10:00:00Z' }),
    conv({ id: 'd', lastAt: '2026-11-05T09:00:00Z' }),
    conv({ id: 'c', lastAt: null }),
  ];
  assert.deepEqual(C.sortConversations(list).map((c) => c.id), ['a', 'b', 'd', 'c']);
  assert.notEqual(C.sortConversations(list), list);
});

test('tab badge = unread chats + pending requests, hidden at 0', () => {
  assert.equal(C.chatBadge({ unreadChats: 2, pendingRequests: 3 }), 5);
  assert.equal(C.chatBadge({ unreadChats: 0, pendingRequests: 0 }), undefined);
  assert.equal(C.chatBadge(undefined), undefined);
  assert.equal(C.chatBadge(null), undefined);
});

test('Message on a profile: open, pending, incoming, or new', () => {
  const req = { id: 'r', fromId: 'x', fromNickname: 'x', fromAvatarKey: null, body: 'hey', requestedAt: '2026-11-05T10:00:00Z' };
  assert.deepEqual(C.existingChatAction([conv({ otherId: 'o' })], [], 'o'), { kind: 'open', conversationId: 'c1' });
  assert.deepEqual(C.existingChatAction([conv({ otherId: 'o', status: 'pending_sent' })], [], 'o'), { kind: 'pending', conversationId: 'c1' });
  assert.deepEqual(C.existingChatAction([], [req], 'x'), { kind: 'incoming' });
  assert.deepEqual(C.existingChatAction([conv({ otherId: 'o' })], [req], 'z'), { kind: 'new' });
});

test('input checks mirror the database (trimmed length)', () => {
  assert.equal(C.checkBody('   ', 200), 'body_required');
  assert.equal(C.checkBody(' hi ', 200), 'ok');
  assert.equal(C.checkBody('x'.repeat(200), 200), 'ok');
  assert.equal(C.checkBody('x'.repeat(201), 200), 'body_too_long');
  assert.equal(C.checkBody(` ${'x'.repeat(200)} `, 200), 'ok');
  assert.equal(C.REQUEST_MAX, 200);
  assert.equal(C.MESSAGE_MAX, 2000);
  assert.equal(C.MESSAGE_PAGE_SIZE, 30);
});

// ---------------------------------------------------------------- messages: paging and polling

const msg = (id, at, over = {}) => ({
  id, senderId: 'o', body: `m${id}`, replyToId: null, replyBody: null, replySenderId: null, createdAt: at, deleted: false, ...over,
});
const t = (min) => new Date(Date.UTC(2026, 10, 5, 10, min)).toISOString();

test('older cursor: last of a full page; none at the start', () => {
  const page = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, t(59 - i)));
  assert.deepEqual(C.olderCursor(page), { at: page[29].createdAt, id: 'm29' });
  assert.equal(C.olderCursor(page.slice(0, 10)), undefined);
});

test('poll merge: new messages join page one, edits replace, older pages keep their place', () => {
  const pages = [[msg('b', t(2)), msg('a', t(1))], [msg('z', t(0))]];
  const merged = C.mergeLatestPage(pages, [msg('c', t(3)), msg('b', t(2), { body: null, deleted: true })], 30);
  assert.deepEqual(merged.map((p) => p.map((m) => m.id)), [['c', 'b', 'a'], ['z']]);
  assert.equal(merged[0][1].deleted, true);
  assert.deepEqual(C.mergeLatestPage([], [msg('a', t(1))]), [[msg('a', t(1))]]);
});

test('poll merge: more than a page arrived (no overlap) restarts from the newest page', () => {
  const pages = [[msg('old', t(0))]];
  const latest = Array.from({ length: 3 }, (_, i) => msg(`n${i}`, t(30 - i)));
  assert.deepEqual(C.mergeLatestPage(pages, latest, 3).map((p) => p.map((m) => m.id)), [['n0', 'n1', 'n2']]);
  // A short latest page always overlaps (it reaches the start of the chat): merged, not restarted.
  assert.deepEqual(C.mergeLatestPage(pages, latest.slice(0, 2), 3).map((p) => p.map((m) => m.id)), [['n0', 'n1', 'old']]);
});

test('upsert: a sent message appears once; a deleted one becomes a stub in place', () => {
  const pages = [[msg('b', t(2)), msg('a', t(1))]];
  const sent = C.upsertMessage(pages, msg('c', t(3), { senderId: 'me' }));
  assert.deepEqual(sent[0].map((m) => m.id), ['c', 'b', 'a']);
  const again = C.upsertMessage(sent, msg('c', t(3), { senderId: 'me' }));
  assert.equal(again.flat().length, 3);
  const del = C.upsertMessage(pages, C.asDeleted(pages[0][1]));
  assert.deepEqual(del[0][1], { ...pages[0][1], body: null, deleted: true });
});

// ---------------------------------------------------------------- optimistic sending

test('outbox: sending -> failed -> retry -> removed when sent; remove; unknown ids change nothing', () => {
  const item = { localId: 'l1', body: 'hi', replyTo: null, status: 'sending', error: null, createdAt: 1 };
  let box = C.outboxReduce([], { type: 'add', item });
  assert.equal(box[0].status, 'sending');
  box = C.outboxReduce(box, { type: 'failed', localId: 'l1', error: 'No connection.' });
  assert.deepEqual([box[0].status, box[0].error, box[0].body], ['failed', 'No connection.', 'hi']);
  box = C.outboxReduce(box, { type: 'retry', localId: 'l1' });
  assert.deepEqual([box[0].status, box[0].error], ['sending', null]);
  // Retry only moves a failed message.
  assert.deepEqual(C.outboxReduce(box, { type: 'retry', localId: 'l1' }), box);
  assert.deepEqual(C.outboxReduce(box, { type: 'remove', localId: 'l1' }), []);
  assert.deepEqual(C.outboxReduce(box, { type: 'failed', localId: 'nope', error: 'x' }), box);
});

test('a failed message keeps its text; Remove hands it back to an empty composer', () => {
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /const body = discard\(localId\);\s*if \(body\) setRestore\(\(r\) => \(\{ text: body, n: \(r\?\.n \?\? 0\) \+ 1 \}\)\);/);
  // The composer puts it back only into an empty box.
  assert.match(read('../components/chat/ChatComposer.tsx'), /if \(restore && restore\.n !== restoredN\) \{\s*setRestoredN\(restore\.n\);\s*if \(text\.trim\(\) === ''\) \{/);
  const hook = read('../hooks/useChatMessages.ts');
  assert.match(hook, /dispatch\(conversationId, \{ type: 'failed', localId, error: getChatError\(error, 'message'\)\.message \}\)/);
});

// ---------------------------------------------------------------- replies, grouping, day lines

test('reply preview: none, mine, theirs, deleted original', () => {
  assert.equal(C.replyPreview({ replyToId: null, replyBody: null, replySenderId: null }, 'me', 'kai'), null);
  assert.deepEqual(C.replyPreview({ replyToId: 'r', replyBody: 'hey\nthere', replySenderId: 'me' }, 'me', 'kai'), { label: 'You', text: 'hey there', deleted: false });
  assert.deepEqual(C.replyPreview({ replyToId: 'r', replyBody: 'yo', replySenderId: 'o' }, 'me', 'kai'), { label: 'kai', text: 'yo', deleted: false });
  assert.deepEqual(C.replyPreview({ replyToId: 'r', replyBody: null, replySenderId: null }, 'me', 'kai'), { label: '', text: 'Deleted message', deleted: true });
});

test('day labels: Today, Yesterday, then a date', () => {
  const now = new Date(2026, 10, 5, 15, 0).getTime();
  assert.equal(C.dayLabel(new Date(2026, 10, 5, 0, 1).getTime(), now), 'Today');
  assert.equal(C.dayLabel(new Date(2026, 10, 4, 23, 59).getTime(), now), 'Yesterday');
  const older = C.dayLabel(new Date(2026, 10, 1, 12, 0).getTime(), now);
  assert.ok(older !== 'Today' && older !== 'Yesterday' && older.length > 0);
});

test('rows: newest first for the inverted list, day line above each day, groups by sender within 5 minutes', () => {
  const local = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).toISOString();
  const server = [
    msg('m4', local(2026, 10, 5, 10, 6), { senderId: 'me' }),
    msg('m3', local(2026, 10, 5, 10, 2)),
    msg('m2', local(2026, 10, 5, 10, 0)),
    msg('m1', local(2026, 10, 4, 22, 0)),
  ];
  const now = new Date(2026, 10, 5, 12, 0).getTime();
  const rows = C.buildChatRows(server, [], 'me', now);
  assert.deepEqual(
    rows.map((r) => (r.kind === 'day' ? `[${r.label}]` : r.id)),
    ['m4', 'm3', 'm2', '[Today]', 'm1', '[Yesterday]'],
  );
  const byId = Object.fromEntries(rows.filter((r) => r.kind === 'message').map((r) => [r.id, r]));
  // m2 and m3: same sender, 2 minutes apart: one group (m2 first in reading order, m3 last).
  assert.deepEqual([byId.m2.firstInGroup, byId.m2.lastInGroup], [true, false]);
  assert.deepEqual([byId.m3.firstInGroup, byId.m3.lastInGroup], [false, true]);
  assert.deepEqual([byId.m4.mine, byId.m4.firstInGroup, byId.m4.lastInGroup], [true, true, true]);
  // A day line splits a group even within 5 minutes.
  const midnight = C.buildChatRows([msg('b', local(2026, 10, 5, 0, 1)), msg('a', local(2026, 10, 4, 23, 59))], [], 'me', now);
  assert.equal(midnight.filter((r) => r.kind === 'day').length, 2);
  // Keys are unique.
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});

test('rows: unsent messages sit below the newest server message, with their status', () => {
  const server = [msg('m1', new Date(2026, 10, 5, 10, 0).toISOString())];
  const out = [{ localId: 'l1', body: 'yo', replyTo: { id: 'm1', body: 'mm1', senderId: 'o' }, status: 'failed', error: 'x', createdAt: new Date(2026, 10, 5, 10, 1).getTime() }];
  const rows = C.buildChatRows(server, out, 'me', new Date(2026, 10, 5, 12, 0).getTime());
  assert.equal(rows[0].kind, 'message');
  assert.deepEqual([rows[0].localId, rows[0].status, rows[0].id, rows[0].mine, rows[0].reply.replyToId], ['l1', 'failed', null, true, 'm1']);
});

// ---------------------------------------------------------------- source scans: privacy and the contract

const ALLOWED_RPCS = [
  'send_chat_request', 'respond_chat_request', 'send_chat_message', 'delete_my_chat_message', 'mark_chat_read', 'set_chat_muted',
  'delete_chat_for_me', 'get_conversations', 'get_chat_requests', 'get_messages', 'get_chat_unread_count', 'get_chat_settings',
  'set_chat_settings', 'chat_heartbeat', 'reopen_my_chat', 'get_message_reactions', 'react_to_chat_message', 'report_chat', 'close_my_chat',
];

test('no code touches the chat tables; chat RPCs are called only from lib/chatApi.ts, all from the contract', () => {
  for (const [path, text] of SRC) {
    assert.doesNotMatch(text, /from\(\s*['"]chat_/, path);
    assert.doesNotMatch(text, /\bchat_(conversations|messages|members|settings)\b/, path);
  }
  const api = read('../lib/chatApi.ts');
  const called = [...api.matchAll(/supabase\.rpc\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(called)].sort(), [...ALLOWED_RPCS].sort());
  for (const [path, text] of SRC) {
    if (path === 'lib/chatApi.ts') continue;
    for (const name of ALLOWED_RPCS) assert.doesNotMatch(text, new RegExp(`rpc\\('${name}'`), path);
  }
});

test('the gate hook is the only reader of chat_mode', () => {
  const readers = [...SRC].filter(([, text]) => /chat_mode/.test(text)).map(([p]) => p);
  assert.deepEqual(readers, ['hooks/useChatEnabled.ts']);
  const gate = read('../hooks/useChatEnabled.ts');
  assert.match(gate, /staleTime: GATE_STALE_MS/);
  assert.match(gate, /queryFn: member \? fetchChatMode : skipToken/);
  assert.match(gate, /const mode = query\.isError \? null : \(query\.data \?\? null\);/);
});

test('every chat query key comes from chatKeys and includes the user id', () => {
  for (const make of Object.values(C.chatKeys)) {
    const key = make('USER', 'CONV');
    assert.equal(key[0], 'chat');
    assert.equal(key[1], 'USER');
  }
  for (const [path, text] of SRC) {
    if (path === 'lib/chat.ts') continue;
    assert.doesNotMatch(text, /queryKey:\s*\[\s*['"]chat['"]/, `${path} builds a chat key by hand`);
  }
  for (const path of CHAT_FILES) {
    const text = SRC.get(path);
    for (const m of text.matchAll(/queryKey: (chatKeys\.\w+)\(([^)]*)\)/g)) assert.match(m[2], /userId|myId/, `${path}: ${m[0]}`);
  }
  // 'chat' is never persisted.
  assert.doesNotMatch(read('../lib/queryClient.ts'), /'chat'/);
});

test('logout and account deletion clear every chat cache, draft and unsent message', () => {
  const auth = read('../lib/auth.ts');
  const clear = auth.slice(auth.indexOf('export function clearMemberCaches'), auth.indexOf('const REVOKE_TIMEOUT_MS'));
  assert.match(clear, /queryClient\.removeQueries\(\{ queryKey: \[CHAT_KEY_ROOT\] \}\);\s*useChatStore\.getState\(\)\.clearAll\(\);/);
  const forget = auth.slice(auth.indexOf('export async function forgetDeletedAccount'));
  assert.match(forget, /queryClient\.removeQueries\(\{ queryKey: \[CHAT_KEY_ROOT\] \}\);\s*useChatStore\.getState\(\)\.clearAll\(\);/);
  assert.match(read('../stores/chatStore.ts'), /clearAll: \(\) => set\(\{ drafts: \{\}, outbox: \{\} \}\)/);
});

test('no message or request text reaches a log, the console, storage or a route param', () => {
  for (const path of CHAT_FILES) {
    const text = SRC.get(path);
    assert.doesNotMatch(text, /console\./, path);
    assert.doesNotMatch(text, /AsyncStorage|SecureStore|expo-file-system/, path);
    // Only logChatError (code only) is used; logError appears only inside it.
    const direct = [...text.matchAll(/\blogError\(/g)].length;
    if (path === 'lib/chatApi.ts') assert.equal(direct, 1, 'logError only inside logChatError');
    else assert.equal(direct, 0, path);
    // Route params: ids only (a chat id, or the member id of a new chat).
    for (const m of text.matchAll(/params: \{([^}]*)\}/g)) assert.match(m[1].trim(), /^(id(: [\w.]+)?|with: [\w.]+)$/, `${path}: ${m[0]}`);
    assert.doesNotMatch(text, /useMutation/, `${path}: the mutation cache would log the raw error`);
  }
  const api = read('../lib/chatApi.ts');
  assert.match(api, /logError\(`chat\.\$\{scope\}`, \{ code: getErrorCode\(error\) \?\? 'unknown' \}\);/);
  // Every failure in the API goes through onChatError (logs the code, then rethrows).
  assert.equal([...api.matchAll(/if \(error\) onChatError\(/g)].length, 19);
  assert.match(read('../stores/chatStore.ts'), /In memory only, never on disk/);
  assert.doesNotMatch(read('../stores/chatStore.ts'), /persist/);
});

test('the Message button and Chat privacy row render only through the gate', () => {
  const profile = read('../app/user/[id].tsx');
  assert.match(profile, /const canMessage = useChatEnabled\(\)\.enabled && status === 'member' && !isSelf;/);
  assert.match(profile, /action=\{canMessage \? <MessageButton member=\{user\} \/> : null\}/);
  assert.equal(profile.split('<MessageButton').length - 1, 1);
  const row = read('../components/chat/ChatPrivacyRow.tsx');
  assert.match(row, /const \{ enabled \} = useChatEnabled\(\);\s*if \(!enabled\) return null;/);
  assert.match(read('../app/(tabs)/profile.tsx'), /<ChatPrivacyRow \/>/);
  // Chat screens leave for guests and when chat is off.
  for (const p of ['../app/chat/[id].tsx', '../app/chat/requests.tsx', '../app/chat-privacy.tsx']) assert.match(read(p), /useChatScreenGuard\(\)/, p);
  const guard = read('../hooks/useChatScreenGuard.ts');
  assert.match(guard, /const leave = status === 'guest' \|\| \(known && !enabled\);/);
});

test('no new dependency; package.json changes only add test scripts', () => {
  const head = JSON.parse(execFileSync('git', ['show', 'HEAD:mobile/package.json'], { cwd: root, encoding: 'utf8' }));
  const now = JSON.parse(read('../package.json'));
  assert.deepEqual(now.dependencies, head.dependencies);
  assert.deepEqual(now.devDependencies, head.devDependencies);
  for (const [k, v] of Object.entries(head.scripts)) assert.equal(now.scripts[k], v, k);
  for (const k of Object.keys(now.scripts)) if (!(k in head.scripts)) assert.match(k, /^test:/, k);
});

// ---------------------------------------------------------------- stage 2b: reopen a chat I deleted

test('already_chatting reopens once; every other code is shown as is', () => {
  assert.equal(C.afterRequestFailure('already_chatting', false), 'reopen');
  assert.equal(C.afterRequestFailure('already_chatting', true), 'show', 'never a second time');
  for (const code of ['request_pending', 'request_incoming', 'request_cooldown', 'not_found', 'not_accepting_messages', null]) {
    assert.equal(C.afterRequestFailure(code, false), 'show', String(code));
  }
});

test('reopen errors reuse the request flow texts', () => {
  const t = (code) => C.chatErrorText(code, 'request', ACCOUNT).message;
  assert.equal(t('not_accepting_messages'), "This member isn't accepting messages.");
  assert.equal(t('not_found'), "This member can't be messaged right now.");
  assert.equal(t('suspended'), ACCOUNT.suspended);
  assert.equal(C.chatErrorText('chat_disabled', 'request', ACCOUNT).action, 'disabled');
});

test('the first message reopens at most once, keeps the typed text as a draft, sends nothing more', () => {
  const hook = read('../hooks/useFirstMessage.ts');
  assert.equal(hook.split('reopenMyChat(').length - 1, 1, 'one call site');
  assert.match(hook, /if \(afterRequestFailure\(code, false\) === 'reopen'\) \{/);
  const fn = hook.slice(hook.indexOf("=== 'reopen') {"), hook.indexOf("if (code === 'request_pending')"));
  assert.match(fn, /useChatStore\.getState\(\)\.setDraft\(conversationId, \{ text, replyTo: null \}\)/);
  assert.match(fn, /openChat\(conversationId\)/);
  assert.doesNotMatch(fn, /sendChatMessage|sendChatRequest|reopenMyChat\(target\.id\)[\s\S]*reopenMyChat\(/, 'no message, no request, no second reopen');
  // The composer keeps Send busy (no double taps) until onSend finishes.
  const composer = read('../components/chat/ChatComposer.tsx');
  assert.match(composer, /setSending\(true\);\s*try \{\s*const taken = await onSend\(text\.trim\(\)\);\s*if \(taken\) change\(''\);\s*\} finally \{\s*setSending\(false\);/);
  // The old sheet is gone.
  assert.equal(existsSync(new URL('../components/chat/ChatRequestSheet.tsx', import.meta.url)), false);
});

test('reopen_my_chat is wrapped once and logs only the error code', () => {
  const api = read('../lib/chatApi.ts');
  const fn = api.slice(api.indexOf('export async function reopenMyChat'));
  assert.match(fn, /supabase\.rpc\('reopen_my_chat', \{ p_with: otherId \}\)/);
  assert.match(fn, /if \(error\) onChatError\('reopen', error\);/);
});

test('the delete-chat confirmation is honest about what happens', () => {
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /It's removed from your chat list and your copy of the messages is cleared\. They aren't told\. You can message them again later from their profile\./);
  assert.doesNotMatch(screen, /This removes the chat for you only\./);
});

// ---------------------------------------------------------------- the first message on the chat page

test('Message always goes to a chat page: existing, my waiting request, Requests, or new', () => {
  const req = { id: 'r', fromId: 'x', fromNickname: 'x', fromAvatarKey: null, body: 'hey', requestedAt: '2026-11-05T10:00:00Z' };
  const route = (convs, reqs, other) => C.startRoute(C.existingChatAction(convs, reqs, other), other);
  assert.deepEqual(route([conv({ otherId: 'o' })], [], 'o'), { kind: 'chat', conversationId: 'c1' });
  assert.deepEqual(route([conv({ otherId: 'o', status: 'pending_sent' })], [], 'o'), { kind: 'chat', conversationId: 'c1' });
  assert.deepEqual(route([], [req], 'x'), { kind: 'requests' });
  assert.deepEqual(route([], [], 'z'), { kind: 'new', memberId: 'z' });
});

test('page state: loading, pending, accepted, missing', () => {
  const s = (over) => C.chatPageState({ routeValid: true, listLoaded: true, listFetching: false, conversation: null, ...over });
  assert.equal(s({ routeValid: false }), 'missing');
  assert.equal(s({ listLoaded: false }), 'loading');
  assert.equal(s({ listFetching: true }), 'loading', 'a refetch may still bring it');
  assert.equal(s({}), 'missing');
  assert.equal(s({ conversation: conv({ status: 'pending_sent' }) }), 'pending');
  assert.equal(s({ conversation: conv({}) }), 'accepted');
  assert.equal(s({ conversation: conv({}), listFetching: true }), 'accepted', 'cached data shows at once');
});

test('a chat that disappears after being shown goes back to the list quietly; a never-seen link does not', () => {
  assert.equal(C.leaveQuietly(true, 'missing'), true);
  assert.equal(C.leaveQuietly(false, 'missing'), false);
  assert.equal(C.leaveQuietly(true, 'loading'), false);
  assert.equal(C.leaveQuietly(true, 'accepted'), false);
});

test('texts: the waiting banner, the read-only composer, the new chat hint', () => {
  assert.equal(C.pendingBanner('kai'), 'Waiting for kai to accept. You can send more messages once they accept.');
  assert.equal(C.PENDING_COMPOSER_REASON, 'You can send more messages once they accept.');
  assert.equal(C.newChatHint('kai'), 'Send a short message to ask kai to chat. They need to accept first.');
});

test('after the first send: the route is replaced by /chat/<id> and the list shows it as waiting', () => {
  assert.deepEqual(C.firstMessageRoute('c9'), { pathname: '/chat/[id]', params: { id: 'c9' } });
  const row = C.pendingConversation({ conversationId: 'c9', other: { id: 'o', nickname: 'kai', avatarKey: null }, body: ' hi there ', myId: 'me', sentAt: '2026-11-07T10:00:00Z' });
  assert.deepEqual(row, {
    id: 'c9', status: 'pending_sent', otherId: 'o', otherNickname: 'kai', otherAvatarKey: null, lastBody: 'hi there',
    lastAt: '2026-11-07T10:00:00Z', lastSender: 'me', unread: 0, muted: false, isOnline: null,
  });
  assert.equal(C.conversationPreview(row, 'me'), 'Request sent');
  const list = C.withConversation([conv({ id: 'c1', lastAt: '2026-11-06T10:00:00Z' }), conv({ id: 'c9', lastAt: '2020-01-01T00:00:00Z' })], row);
  assert.deepEqual(list.map((c) => c.id), ['c9', 'c1'], 'replaced, not duplicated, newest first');
  assert.deepEqual(C.withConversation(undefined, row).map((c) => c.id), ['c9']);
  // The page reads it with chatPageState: pending, no get_messages.
  assert.equal(C.chatPageState({ routeValid: true, listLoaded: true, listFetching: false, conversation: row }), 'pending');
});

test('the waiting request shows as my one bubble, without an id (no reply, no delete)', () => {
  const row = C.pendingConversation({ conversationId: 'c9', other: { id: 'o', nickname: 'kai', avatarKey: null }, body: 'hi', myId: 'me', sentAt: '2026-11-07T10:00:00Z' });
  const rows = C.pendingRows(row, 'me', Date.parse('2026-11-07T12:00:00Z'));
  const messages = rows.filter((r) => r.kind === 'message');
  assert.equal(messages.length, 1);
  assert.deepEqual([messages[0].body, messages[0].mine, messages[0].id], ['hi', true, null]);
  assert.equal(rows.filter((r) => r.kind === 'day').length, 1);
  assert.deepEqual(C.pendingRows({ ...row, lastBody: null }, 'me', 0), []);
});

test('the chat page asks nothing extra: no get_messages until accepted; the new page reads the cache only', () => {
  const page = read('../app/chat/[id].tsx');
  assert.match(page, /const chat = useChatMessages\(accepted \? conversationId : '', pollMs !== false && accepted, pollMs\);/);
  assert.match(page, /useConversations\(conversation\?\.status === 'pending_sent' && pollMs !== false\)/);
  const fresh = read('../app/chat/new.tsx');
  assert.match(fresh, /useUserProfile\(ready && otherId !== myId \? otherId : null, true\)/);
  assert.match(fresh, /queryClient\.getQueryData<Conversation\[\]>\(chatKeys\.conversations\(myId\)\)/);
  assert.doesNotMatch(fresh, /useConversations|fetchQuery|useChatMessages/);
  assert.match(read('../hooks/useUserProfile.ts'), /\.\.\.\(cachedFirst \? \{ staleTime: Infinity \} : \{\}\)/);
  assert.match(read('../hooks/useFirstMessage.ts'), /router\.replace\(firstMessageRoute\(conversationId\)\)/);
});

test('typing never re-renders the screen: the text lives in the composer only', () => {
  const page = read('../app/chat/[id].tsx');
  assert.doesNotMatch(page, /useState\(saved\?\.text|setText\(/);
  assert.doesNotMatch(read('../app/chat/new.tsx'), /useState<string>|setText\(/);
  const composer = read('../components/chat/ChatComposer.tsx');
  assert.match(composer, /const \[text, setText\] = useState\(/);
  assert.match(composer, /export const ChatComposer = memo\(ChatComposerImpl\);/);
  assert.match(read('../components/chat/MessageBubble.tsx'), /export const MessageBubble = memo\(/);
  assert.match(page, /const keyExtractor = \(row: ChatRow\) => row\.key;/);
  // Handlers passed to the list and the composer are stable (useCallback), not inline.
  assert.match(page, /const onSend = useCallback\(/);
  assert.match(page, /const cancelReply = useCallback\(/);
  assert.match(page, /const renderItem = useCallback\(/);
});
