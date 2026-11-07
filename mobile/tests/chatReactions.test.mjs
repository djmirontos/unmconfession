// Run with: npm run test:chatreactions  (Node 22.6+ strips the TypeScript types of the import)
// Chat message reactions: one per member per message, six keys, silent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { test } from 'node:test';

register('./aliasHook.mjs', import.meta.url);

const R = await import('../lib/chatReactions.ts');
const C = await import('../lib/chat.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ACCOUNT = { banned: 'B', suspended: 'This account is suspended for now. Try again later.', nickname_required: 'N', not_authenticated: 'A', network: 'No connection.' };

// ---------------------------------------------------------------- keys and glyphs

test('six keys, in order, with glyphs and labels', () => {
  assert.deepEqual([...R.REACTION_KEYS], ['like', 'love', 'laugh', 'wow', 'sad', 'thanks']);
  assert.deepEqual(R.REACTION_KEYS.map((k) => R.REACTION_GLYPH[k]), ['👍', '❤️', '😂', '😮', '😢', '🙏']);
  assert.deepEqual(R.REACTION_KEYS.map((k) => R.REACTION_LABEL[k]), ['Like', 'Love', 'Laugh', 'Wow', 'Sad', 'Thanks']);
  assert.equal(R.isReactionKey('love'), true);
  assert.equal(R.isReactionKey('heart'), false);
  assert.equal(R.isReactionKey(null), false);
});

test('the keys match the database check', () => {
  const sql = read('../../supabase/migrations/20261107120000_chat_reactions.sql');
  assert.match(sql, /reaction in \('like', 'love', 'laugh', 'wow', 'sad', 'thanks'\)/);
});

// ---------------------------------------------------------------- toggle, replace, remove

test('tapping: mine again removes it; another replaces mine; none sets it', () => {
  assert.equal(R.nextReaction(null, 'like'), 'like');
  assert.equal(R.nextReaction('like', 'like'), null);
  assert.equal(R.nextReaction('like', 'love'), 'love');
});

test('my change moves one count: set, replace, remove, no-op', () => {
  assert.deepEqual(R.withMyReaction(undefined, 'like'), { counts: { like: 1 }, mine: 'like' });
  const both = { counts: { like: 2 }, mine: 'like' };
  assert.deepEqual(R.withMyReaction(both, 'love'), { counts: { like: 1, love: 1 }, mine: 'love' });
  assert.deepEqual(R.withMyReaction(both, null), { counts: { like: 1 }, mine: null });
  assert.equal(R.withMyReaction({ counts: { sad: 1 }, mine: 'sad' }, null), undefined, 'nothing left: no entry');
  assert.equal(R.withMyReaction(both, 'like'), both, 'same reaction: same object');
  // Theirs is what is not mine.
  assert.equal(R.theirCount(both, 'like'), 1);
  assert.equal(R.theirCount({ counts: { like: 1 }, mine: null }, 'like'), 1);
  assert.equal(R.theirCount(undefined, 'like'), 0);
});

// ---------------------------------------------------------------- the cache

test('rows to a map; unknown keys and zero counts ignored', () => {
  const map = R.reactionsFromRows([
    { message_id: 'm1', reaction: 'like', reaction_count: 2, mine: true },
    { message_id: 'm1', reaction: 'love', reaction_count: 1, mine: false },
    { message_id: 'm2', reaction: 'heart', reaction_count: 1, mine: false },
    { message_id: 'm3', reaction: 'sad', reaction_count: 0, mine: false },
  ]);
  assert.deepEqual(map, { m1: { counts: { like: 2, love: 1 }, mine: 'like' } });
});

test('optimistic update touches one entry only (others keep their objects)', () => {
  const m2 = { counts: { wow: 1 }, mine: null };
  const map = { m1: { counts: { like: 1 }, mine: null }, m2 };
  const next = R.setMyReaction(map, 'm1', 'like');
  assert.deepEqual(next.m1, { counts: { like: 2 }, mine: 'like' });
  assert.equal(next.m2, m2, 'unchanged message: same object (its bubble does not re-render)');
  assert.equal(R.setMyReaction(next, 'm1', 'like'), next, 'no change: same map');
  // Rollback restores what was there before.
  const back = R.setMyReaction(next, 'm1', null);
  assert.deepEqual(back.m1, { counts: { like: 1 }, mine: null });
  // Removing the only reaction drops the entry.
  assert.equal('m3' in R.setMyReaction({ m3: { counts: { sad: 1 }, mine: 'sad' } }, 'm3', null), false);
  assert.deepEqual(R.setMyReaction(undefined, 'm9', 'thanks'), { m9: { counts: { thanks: 1 }, mine: 'thanks' } });
});

test('a refresh keeps unchanged objects and returns the old map when nothing changed', () => {
  const a = { counts: { like: 1 }, mine: null };
  const prev = { m1: a };
  const same = R.mergeReactions(prev, { m1: { counts: { like: 1 }, mine: null } });
  assert.equal(same, prev);
  const changed = R.mergeReactions(prev, { m1: { counts: { like: 1 }, mine: null }, m2: { counts: { sad: 1 }, mine: 'sad' } });
  assert.notEqual(changed, prev);
  assert.equal(changed.m1, a);
  assert.equal(Object.keys(R.mergeReactions(prev, {})).length, 0, 'removed elsewhere: gone');
  assert.equal(R.mergeReactions(undefined, prev), prev);
});

test('a refresh that lands during my change keeps the optimistic value for that message', () => {
  const optimistic = { counts: { love: 1 }, mine: 'love' };
  const prev = { m1: optimistic, m2: { counts: { like: 1 }, mine: null } };
  const server = { m2: { counts: { like: 2 }, mine: null } };
  const out = R.keepPending(prev, server, new Set(['m1']));
  assert.equal(out.m1, optimistic);
  assert.deepEqual(out.m2, { counts: { like: 2 }, mine: null });
  assert.equal(R.keepPending(prev, server, new Set()), server);
  assert.equal('m3' in R.keepPending(prev, { m3: { counts: { wow: 1 }, mine: null } }, new Set(['m3'])), false);
});

// ---------------------------------------------------------------- fetching

test('ids: at most 100 per call, only stored and not deleted, a stable key', () => {
  const ids = Array.from({ length: 230 }, (_, i) => `m${i}`);
  assert.deepEqual(R.chunkIds(ids).map((c) => c.length), [100, 100, 30]);
  assert.deepEqual(R.chunkIds([]), []);
  assert.deepEqual(R.chunkIds(['a'], 100), [['a']]);
  assert.deepEqual(R.reactableIds([{ id: 'a', deleted: false }, { id: 'b', deleted: true }]), ['a']);
  assert.equal(R.idsKey(['b', 'a']), R.idsKey(['a', 'b']));
  assert.equal(R.idsKey([]), '');
});

test('badges: fixed order, count shown only above 1, mine marked', () => {
  assert.deepEqual(R.reactionBadges(undefined), []);
  assert.deepEqual(R.reactionBadges({ counts: { thanks: 1, like: 2 }, mine: 'like' }), [
    { key: 'like', glyph: '👍', count: 2, mine: true },
    { key: 'thanks', glyph: '🙏', count: 1, mine: false },
  ]);
  const bubble = read('../components/chat/MessageBubble.tsx');
  assert.match(bubble, /\{b\.count > 1 \? <Text/);
});

// ---------------------------------------------------------------- errors

test('reaction errors: friendly texts, account wording, never a raw code', () => {
  const t = (code) => C.chatErrorText(code, 'react', ACCOUNT);
  assert.equal(t('rate_limited').message, 'Slow down a little.');
  assert.equal(t('not_found').message, 'This message is no longer available.');
  assert.equal(t('suspended').message, ACCOUNT.suspended);
  assert.equal(t('chat_disabled').action, 'disabled');
  assert.equal(t('invalid_reaction').message, 'Something went wrong. Please try again.');
  assert.ok(C.CHAT_ERROR_CODES.includes('invalid_reaction'));
  // Elsewhere rate_limited keeps the message wording.
  assert.equal(C.chatErrorText('rate_limited', 'message', ACCOUNT).message, "You're sending messages too fast. Wait a moment.");
});

// ---------------------------------------------------------------- wiring and performance

test('one call per load or poll, never per bubble; skipped when not live', () => {
  const hook = read('../hooks/useChatReactions.ts');
  assert.match(hook, /queryFn: skipToken/);
  assert.match(hook, /setTimeout\(\(\) => void refresh\(\), DEBOUNCE_MS\)/);
  assert.match(hook, /if \(pollMs === false \|\| !conversationId\) return;\s*const timer = setInterval\(\(\) => void refresh\(\), pollMs\);/);
  assert.match(hook, /mergeReactions\(prev, keepPending\(prev, reactionsFromRows\(rows\), pending\.current\)\)/);
  const api = read('../lib/chatApi.ts');
  assert.match(api, /const chunks = chunkIds\(messageIds\);/);
  for (const path of ['../components/chat/MessageBubble.tsx', '../components/chat/MessageActionsOverlay.tsx']) {
    assert.doesNotMatch(read(path), /fetchMessageReactions|get_message_reactions|useChatReactions/, path);
  }
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /useChatReactions\(accepted \? conversationId : '', loadedIds, accepted \? pollMs : false\)/);
});

test('optimistic with rollback and a toast; one change per message at a time', () => {
  const hook = read('../hooks/useChatReactions.ts');
  const react = hook.slice(hook.indexOf('const react = useCallback'), hook.indexOf('const toggle = useCallback'));
  assert.match(react, /if \(pending\.current\.has\(messageId\)\) return;/);
  assert.ok(react.indexOf('setMyReaction(prev, messageId, reaction)') < react.indexOf('reactToChatMessage(messageId, reaction)'), 'cache first');
  assert.match(react, /setMyReaction\(prev, messageId, before\)/);
  assert.match(react, /useToastStore\.getState\(\)\.show\(getChatError\(error, 'react'\)\.message\)/);
});

test('each bubble gets only its own slice; the bar mounts only while open; no UI when pending or deleted', () => {
  const screen = read('../app/chat/[id].tsx');
  assert.match(screen, /reactions=\{item\.id \? reactions\?\.\[item\.id\] : undefined\}/);
  assert.match(screen, /\{menuFor \? \(\s*<MessageActionsOverlay/);
  assert.match(screen, /showReactions=\{menuFor\.row\.id !== null && !menuFor\.row\.deleted\}/);
  // The waiting request's bubble gets no reactions and no handler.
  const waiting = screen.slice(screen.indexOf('const renderWaiting'), screen.indexOf('const renderItem'));
  assert.doesNotMatch(waiting, /reactions=|onReact=/);
  const bubble = read('../components/chat/MessageBubble.tsx');
  assert.match(bubble, /\{reactions && onReact && !row\.deleted \? <ReactionBadges/);
  assert.match(bubble, /onLongPress=\{row\.status === 'sent' && !row\.deleted \?/);
  assert.match(bubble, /export const MessageBubble = memo\(/);
  // Silent: nothing in the app notifies or touches the list or unread on a reaction.
  const hook = read('../hooks/useChatReactions.ts');
  assert.doesNotMatch(hook, /invalidateChatLists|unread|notification/i);
});
