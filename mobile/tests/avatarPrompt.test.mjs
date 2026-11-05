// Run with: npm run test:avatarprompt  (Node 22.6+ strips the TypeScript types of the import)
// The Profile "Pick your avatar" card: once, only right after onboarding.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const A = await import('../lib/avatarPrompt.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      get: async (key) => data.get(key) ?? null,
      set: async (key, value) => void data.set(key, value),
      remove: async (key) => void data.delete(key),
    },
  };
}

// ---------------------------------------------------------------- the rule

test('shown only when pending and not seen; seen beats pending', () => {
  assert.equal(A.shouldShowAvatarPrompt({ pending: true, seen: false }), true);
  assert.equal(A.shouldShowAvatarPrompt({ pending: false, seen: false }), false); // existing members
  assert.equal(A.shouldShowAvatarPrompt({ pending: true, seen: true }), false);
  assert.equal(A.shouldShowAvatarPrompt({ pending: false, seen: true }), false);
});

test('keys contain the user id (account deletion removes them)', () => {
  assert.equal(A.avatarPendingKey('u-123'), 'unm-avatar-prompt-pending:u-123');
  assert.equal(A.avatarSeenKey('u-123'), 'unm-avatar-picker-seen:u-123');
  assert.match(read('../lib/auth.ts'), /keys\.filter\(\(k\) => k\.includes\(userId\)\)/);
});

test('an existing member (no pending flag) never sees it, even on a fresh install', async () => {
  const { storage } = memoryStorage();
  const state = await A.readAvatarPrompt(storage, 'old');
  assert.deepEqual(state, { pending: false, seen: false });
  assert.equal(A.avatarPromptVisible({ userId: 'old', member: true, stored: state, showingFor: null }), false);
});

test('once shown: seen is stored and pending removed, but it stays up for this visit', async () => {
  const { storage, data } = memoryStorage();
  await A.writePending(storage, 'new');
  const stored = await A.readAvatarPrompt(storage, 'new');
  assert.equal(A.avatarPromptVisible({ userId: 'new', member: true, stored, showingFor: null }), true);
  // First shown: the hook records who it is showing to, then writes seen.
  await A.writeSeen(storage, 'new');
  assert.deepEqual([...data.keys()], ['unm-avatar-picker-seen:new']);
  // Same visit: the cache now reads "seen", but it stays visible.
  assert.equal(A.avatarPromptVisible({ userId: 'new', member: true, stored: A.SEEN_STATE, showingFor: 'new' }), true);
  // Next mount or app start: read again from storage, nothing to show.
  const again = await A.readAvatarPrompt(storage, 'new');
  assert.deepEqual(again, { pending: false, seen: true });
  assert.equal(A.avatarPromptVisible({ userId: 'new', member: true, stored: again, showingFor: null }), false);
});

test('dismiss and the picker both hide it at once and store seen', async () => {
  const { storage } = memoryStorage({ 'unm-avatar-prompt-pending:new': '1' });
  // markSeen: showingFor cleared, cache set to SEEN, storage written.
  assert.equal(A.avatarPromptVisible({ userId: 'new', member: true, stored: A.SEEN_STATE, showingFor: null }), false);
  await A.writeSeen(storage, 'new');
  assert.deepEqual(await A.readAvatarPrompt(storage, 'new'), { pending: false, seen: true });
});

test('guests and non-members never see it; another account never sees this one', () => {
  const pending = { pending: true, seen: false };
  assert.equal(A.avatarPromptVisible({ userId: null, member: false, stored: pending, showingFor: null }), false);
  assert.equal(A.avatarPromptVisible({ userId: 'u', member: false, stored: pending, showingFor: null }), false);
  // Shown to A this visit; B on the same phone does not inherit it.
  assert.equal(A.avatarPromptVisible({ userId: 'b', member: true, stored: { pending: false, seen: false }, showingFor: 'a' }), false);
});

test('an account switch discards the old account read', () => {
  const src = read('../hooks/useAvatarPrompt.ts');
  const fn = src.slice(src.indexOf('async function readFor'), src.indexOf('export function markPending'));
  assert.ok(fn.indexOf('readAvatarPrompt(storage, userId)') < fn.indexOf('useAuthStore.getState().session?.user.id !== userId'));
  assert.match(fn, /throw new StaleAccountError/);
  // The query key is per user, so a result is never shown for another account.
  assert.match(src, /queryKey = \(userId: string\) => \['avatar-prompt', userId\]/);
});

// ---------------------------------------------------------------- structure (source scans)

test('markPending: only after a successful sign-up code and after set_nickname succeeds', () => {
  const verify = read('../app/(auth)/verify.tsx');
  const handle = verify.slice(verify.indexOf('const handleVerify'), verify.indexOf('const handleResend'));
  const call = handle.indexOf('markPending(userId)');
  assert.ok(call > handle.indexOf('await verifyEmailOtp('), 'after the code is accepted');
  assert.ok(call > handle.indexOf("if (purpose === 'recovery') router.replace('/reset-password');"), 'in the non-recovery branch');
  assert.ok(call < handle.indexOf('} catch'), 'not on failure');
  assert.equal(handle.split('markPending(').length - 1, 1);

  const nick = read('../app/choose-nickname.tsx');
  const save = nick.slice(nick.indexOf('const save = async'), nick.indexOf('const handleSubmit'));
  assert.ok(save.indexOf('markPending(userId)') > save.indexOf('if (error) throw error;'));
  assert.ok(save.indexOf('markPending(userId)') < save.indexOf('} catch'));
});

test('no other file calls markPending', async () => {
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const callers = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && /markPending\(/.test(readFileSync(p, 'utf8'))) callers.push(e.name);
    }
  };
  for (const d of ['app', 'components', 'hooks', 'lib', 'stores']) walk(join(root, d));
  assert.deepEqual(callers.sort(), ['choose-nickname.tsx', 'useAvatarPrompt.ts', 'verify.tsx']);
});

test('markSeen clears pending; the card dismiss and the picker both call it', () => {
  assert.match(read('../lib/avatarPrompt.ts'), /storage\.remove\(avatarPendingKey\(userId\)\)/);
  const hook = read('../hooks/useAvatarPrompt.ts');
  const markSeen = hook.slice(hook.indexOf('const markSeen'), hook.indexOf('const showPrompt'));
  assert.match(markSeen, /writeSeen\(storage, userId\)/);
  const profile = read('../app/(tabs)/profile.tsx');
  assert.match(profile, /<AvatarPrompt onPick=\{openPicker\} onDismiss=\{markSeen\} \/>/);
  const openPicker = profile.slice(profile.indexOf('const openPicker'), profile.indexOf('const pickPhoto'));
  assert.match(openPicker, /markSeen\(\)/);
  assert.match(profile, /onChangeAvatar=\{openPicker\}/);
});

test('every storage write in the hook has a catch', () => {
  const hook = read('../hooks/useAvatarPrompt.ts');
  const writes = [...hook.matchAll(/AsyncStorage\.(setItem|removeItem)\([^)]*\)/g)];
  assert.equal(writes.length, 2);
  for (const w of writes) assert.match(hook.slice(w.index, w.index + 140), /\)\.catch\(/);
});
