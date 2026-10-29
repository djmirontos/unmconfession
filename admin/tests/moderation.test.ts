import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { codeFromError, messageFor, renameErrorCode } from '@/lib/errors';
import { contentActions, isActivelySuspended, type TargetUser, userActions, type Viewer } from '@/lib/moderation/availability';
import { contentListArgs } from '@/lib/moderation/content-args';
import { moderationActionLabel, reportReasonLabel } from '@/lib/moderation/labels';
import { describeRemoveFlow, describeResolve, removeThenResolve, resolveEach } from '@/lib/moderation/resolve';
import {
  banSchema,
  contentFiltersSchema,
  deleteAccountSchema,
  emailSchema,
  historyQuerySchema,
  keysetCursorSchema,
  nicknameSchema,
  removeSchema,
  resolveSchema,
  restoreUserSchema,
  roleSchema,
  suspendSchema,
  userFiltersSchema,
  userFiltersValueSchema,
} from '@/lib/moderation/schemas';
import { isFuture, manilaLocalToUtc, presetUntil, suspensionLabel } from '@/lib/moderation/suspension';
import { keyOf, pickNextAfterAction, type QueueEntry } from '@/lib/review/queue';

const U1 = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const U2 = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const NOW = Date.parse('2026-10-27T08:00:00Z');

// ------------------------------------------------------------ multi-step flows

describe('resolveEach', () => {
  it('counts resolved, already handled (not_found) and failed separately', async () => {
    const codes: Record<string, string | null> = { a: null, b: 'not_found', c: 'network', d: null };
    const out = await resolveEach(['a', 'b', 'c', 'd'], async (id) => codes[id]);
    expect(out).toEqual({ resolved: 2, alreadyHandled: 1, failed: 1, firstError: 'network' });
  });
  it('treats an empty list as nothing to do', async () => {
    expect(await resolveEach([], async () => null)).toEqual({ resolved: 0, alreadyHandled: 0, failed: 0, firstError: null });
  });
});

describe('removeThenResolve', () => {
  const steps = (over: Partial<Parameters<typeof removeThenResolve>[0]> = {}) => ({
    remove: vi.fn(async () => null as string | null),
    isRemoved: vi.fn(async () => true),
    openReportIds: vi.fn(async () => ['r1', 'r2'] as string[] | null),
    resolveOne: vi.fn(async () => null as string | null),
    ...over,
  });

  it('removes, then resolves every open report', async () => {
    const s = steps();
    const result = await removeThenResolve(s);
    expect(result).toEqual({ kind: 'done', removed: 'now', reports: { resolved: 2, alreadyHandled: 0, failed: 0, firstError: null } });
    expect(s.resolveOne).toHaveBeenCalledTimes(2);
    expect(describeRemoveFlow(result)).toBe('Content removed. Reports marked handled.');
  });

  it('is done when the removal already resolved the reports (none left open)', async () => {
    const result = await removeThenResolve(steps({ openReportIds: async () => [] }));
    expect(result.kind).toBe('done');
  });

  it('stops without touching reports when the removal fails', async () => {
    const s = steps({ remove: async () => 'forbidden' });
    expect(await removeThenResolve(s)).toEqual({ kind: 'failed', code: 'forbidden' });
    expect(s.openReportIds).not.toHaveBeenCalled();
  });

  it('continues when someone else already removed it', async () => {
    const result = await removeThenResolve(steps({ remove: async () => 'invalid_transition', isRemoved: async () => true }));
    expect(result).toMatchObject({ kind: 'done', removed: 'already' });
    expect(describeRemoveFlow(result)).toMatch(/^The content was already removed/);
  });

  it('fails when the transition is invalid for another reason (still published or pending)', async () => {
    expect(await removeThenResolve(steps({ remove: async () => 'invalid_transition', isRemoved: async () => false }))).toEqual({
      kind: 'failed',
      code: 'invalid_transition',
    });
  });

  it('reports a partial result when some reports could not be resolved', async () => {
    const result = await removeThenResolve(steps({ resolveOne: async (id) => (id === 'r2' ? 'network' : null) }));
    expect(result).toMatchObject({ kind: 'partial', reports: { resolved: 1, failed: 1 } });
    expect(describeRemoveFlow(result)).toBe('Content removed, but 1 report could not be marked handled.');
  });

  it('reports a partial result when the open reports cannot be read after removing', async () => {
    expect(await removeThenResolve(steps({ openReportIds: async () => null }))).toMatchObject({ kind: 'partial', removed: 'now' });
  });

  it('does not count reports someone else handled meanwhile as failures', async () => {
    const result = await removeThenResolve(steps({ resolveOne: async () => 'not_found' }));
    expect(result).toMatchObject({ kind: 'done', reports: { alreadyHandled: 2, failed: 0 } });
  });
});

describe('describeResolve', () => {
  const base = { resolved: 0, alreadyHandled: 0, failed: 0, firstError: null };
  it('words each outcome precisely', () => {
    expect(describeResolve({ ...base, resolved: 3 }, 'dismissed')).toBe('3 reports dismissed.');
    expect(describeResolve({ ...base, resolved: 1 }, 'actioned')).toBe('1 report marked handled.');
    expect(describeResolve({ ...base, alreadyHandled: 2 }, 'actioned')).toBe('These reports were already handled.');
    expect(describeResolve({ ...base, resolved: 1, failed: 2 }, 'actioned')).toBe('1 report marked handled, 2 could not be.');
  });
});

// ------------------------------------------------------------ next report

describe('next reported item', () => {
  // Report rows are ordered by their first open report.
  const r = (type: QueueEntry['target_type'], id: string, minute: number): QueueEntry => ({
    target_type: type,
    target_id: id,
    created_at: `2026-10-27T08:0${minute}:00+00:00`,
  });
  const a = r('post', 'a', 1);
  const b = r('comment', 'b', 2);
  const c = r('listing', 'c', 3);

  it('goes to the next item after the handled one', () => {
    expect(pickNextAfterAction([c], [a, b, c], keyOf(b))).toEqual(c);
  });
  it('wraps to the oldest remaining item after the last one', () => {
    expect(pickNextAfterAction([], [a, b], keyOf(c))).toEqual(a);
  });
  it('returns null when no reports are left', () => {
    expect(pickNextAfterAction([], [], keyOf(a))).toBeNull();
  });
  it('never returns the item just handled, even if it still has open reports', () => {
    expect(pickNextAfterAction([], [b], keyOf(b))).toBeNull();
  });
  it('keeps the type filter', () => {
    expect(pickNextAfterAction([b, c], [a, b, c], keyOf(a), 'listing')).toEqual(c);
  });
});

// ------------------------------------------------------------ suspension dates

describe('suspension dates', () => {
  it('turns presets into UTC end times from now', () => {
    expect(presetUntil('1d', NOW)).toBe('2026-10-28T08:00:00.000Z');
    expect(presetUntil('30d', NOW)).toBe('2026-11-26T08:00:00.000Z');
  });
  it('reads a custom datetime-local value as Manila time (UTC+8, no DST)', () => {
    expect(manilaLocalToUtc('2026-11-01T14:30')).toBe('2026-11-01T06:30:00.000Z');
    expect(manilaLocalToUtc('2026-11-01T00:15')).toBe('2026-10-31T16:15:00.000Z');
    expect(manilaLocalToUtc('2026-07-01T08:00:30')).toBe('2026-07-01T00:00:30.000Z');
  });
  it('rejects malformed custom values', () => {
    expect(manilaLocalToUtc('')).toBeNull();
    expect(manilaLocalToUtc('tomorrow')).toBeNull();
    expect(manilaLocalToUtc('2026-13-01T10:00')).toBeNull();
  });
  it('requires the end to be in the future', () => {
    expect(isFuture('2026-10-27T08:00:01Z', NOW)).toBe(true);
    expect(isFuture('2026-10-27T08:00:00Z', NOW)).toBe(false);
    expect(isFuture('2026-10-26T08:00:00Z', NOW)).toBe(false);
    expect(isFuture('nonsense', NOW)).toBe(false);
  });
  it('shows "Suspension ended" for a past end date', () => {
    expect(suspensionLabel('suspended', '2026-10-26T00:00:00Z', NOW)).toBe('Suspension ended');
    expect(suspensionLabel('suspended', '2026-10-30T00:00:00Z', NOW)).toMatch(/^Suspended until /);
    expect(suspensionLabel('suspended', null, NOW)).toBe('Suspended (no end date)');
    expect(suspensionLabel('active', null, NOW)).toBeNull();
  });
  it('knows when a suspension is still in force', () => {
    expect(isActivelySuspended('suspended', '2026-10-30T00:00:00Z', NOW)).toBe(true);
    expect(isActivelySuspended('suspended', '2026-10-01T00:00:00Z', NOW)).toBe(false);
    expect(isActivelySuspended('suspended', null, NOW)).toBe(true);
    expect(isActivelySuspended('banned', null, NOW)).toBe(false);
  });
});

// ------------------------------------------------------------ who can act on whom

describe('userActions availability', () => {
  const admin: Viewer = { id: 'admin-1', isAdmin: true };
  const mod: Viewer = { id: 'mod-1', isAdmin: false };
  const target = (over: Partial<TargetUser> = {}): TargetUser => ({
    id: 'target',
    role: 'user',
    status: 'active',
    suspendedUntil: null,
    deleted: false,
    ...over,
  });
  const on = (viewer: Viewer, t: TargetUser) =>
    Object.entries(userActions(viewer, t, NOW))
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();

  it('moderator on an active user: suspend and ban only', () => {
    expect(on(mod, target())).toEqual(['ban', 'suspend']);
  });
  it('moderator on a moderator or admin: nothing', () => {
    expect(on(mod, target({ role: 'moderator' }))).toEqual([]);
    expect(on(mod, target({ role: 'admin' }))).toEqual([]);
  });
  it('admin on a moderator: status actions plus admin tools', () => {
    expect(on(admin, target({ role: 'moderator' }))).toEqual(['ban', 'changeRole', 'rename', 'revealIdentity', 'suspend']);
  });
  it('admin on another admin: no status actions, no deletion (database refuses admin targets)', () => {
    expect(on(admin, target({ role: 'admin' }))).toEqual(['changeRole', 'rename', 'revealIdentity']);
  });
  it('nobody changes their own status or role or deletes themselves', () => {
    expect(on(admin, target({ id: 'admin-1', role: 'admin' }))).toEqual(['rename', 'revealIdentity']);
    expect(on(mod, target({ id: 'mod-1', role: 'moderator' }))).toEqual([]);
  });
  it('a deleted account has no actions for anyone', () => {
    expect(on(admin, target({ deleted: true, status: 'banned' }))).toEqual([]);
    expect(on(mod, target({ deleted: true }))).toEqual([]);
  });
  it('banned user: restore (and, for admins, delete); no second ban or suspension', () => {
    expect(on(mod, target({ status: 'banned' }))).toEqual(['restore']);
    expect(on(admin, target({ status: 'banned' }))).toEqual(['changeRole', 'deleteAccount', 'rename', 'restore', 'revealIdentity']);
  });
  it('account deletion only while actively restricted', () => {
    expect(userActions(admin, target({ status: 'suspended', suspendedUntil: '2026-11-01T00:00:00Z' }), NOW).deleteAccount).toBe(true);
    expect(userActions(admin, target({ status: 'suspended', suspendedUntil: '2026-10-01T00:00:00Z' }), NOW).deleteAccount).toBe(false);
    expect(userActions(admin, target({ status: 'active' }), NOW).deleteAccount).toBe(false);
  });
  it('an ended suspension can still be restored or changed', () => {
    const t = target({ status: 'suspended', suspendedUntil: '2026-10-01T00:00:00Z' });
    expect(userActions(mod, t, NOW)).toMatchObject({ restore: true, suspend: true, ban: true });
  });
});

// ------------------------------------------------------------ schemas

describe('schemas', () => {
  it('keyset cursor needs an ISO timestamp and a uuid', () => {
    expect(keysetCursorSchema.safeParse({ ts: '2026-10-27T08:00:00.123456+00:00', id: U1 }).success).toBe(true);
    expect(keysetCursorSchema.safeParse({ ts: 'now', id: U1 }).success).toBe(false);
    expect(keysetCursorSchema.safeParse({ ts: '2026-10-27T08:00:00Z', id: 'x' }).success).toBe(false);
  });
  it('remove needs a known reason; resolve only actioned or dismissed', () => {
    expect(removeSchema.safeParse({ type: 'post', id: U1, reason: 'spam' }).success).toBe(true);
    expect(removeSchema.safeParse({ type: 'post', id: U1 }).success).toBe(false);
    expect(resolveSchema.safeParse({ type: 'comment', id: U1, status: 'dismissed' }).success).toBe(true);
    expect(resolveSchema.safeParse({ type: 'comment', id: U1, status: 'open' }).success).toBe(false);
  });
  it('suspension needs a future-shaped timestamp and a 3-300 character reason', () => {
    const ok = (reason: string, until = '2026-11-01T00:00:00Z') => suspendSchema.safeParse({ user: U1, until, reason }).success;
    expect(ok('Spam links')).toBe(true);
    expect(ok('ab')).toBe(false);
    expect(ok('   abc   ')).toBe(true);
    expect(ok('x'.repeat(301))).toBe(false);
    expect(ok('Spam links', 'next week')).toBe(false);
  });
  it('ban needs a reason; restore takes an optional one', () => {
    expect(banSchema.safeParse({ user: U1, reason: 'Threats' }).success).toBe(true);
    expect(banSchema.safeParse({ user: U1, reason: '' }).success).toBe(false);
    expect(restoreUserSchema.safeParse({ user: U1 }).success).toBe(true);
    expect(restoreUserSchema.safeParse({ user: U1, reason: 'x'.repeat(301) }).success).toBe(false);
  });
  it('roles and nicknames follow the database rules', () => {
    expect(roleSchema.safeParse({ user: U1, role: 'moderator' }).success).toBe(true);
    expect(roleSchema.safeParse({ user: U1, role: 'owner' }).success).toBe(false);
    for (const good of ['abc', 'Juan.Dela_Cruz', 'a1b2c3d4e5f6g7h8i9j0']) expect(nicknameSchema.safeParse({ user: U1, nickname: good }).success).toBe(true);
    for (const bad of ['ab', 'with space', 'émile', 'x'.repeat(21), 'semi;colon']) expect(nicknameSchema.safeParse({ user: U1, nickname: bad }).success).toBe(false);
  });
  it('account deletion needs a reason up to 300 and the typed nickname', () => {
    expect(deleteAccountSchema.safeParse({ user: U1, reason: 'Spam account', confirm: 'spammer1' }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ user: U1, reason: '', confirm: 'spammer1' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ user: U1, reason: 'x'.repeat(301), confirm: 'spammer1' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ user: U1, reason: 'ok', confirm: '' }).success).toBe(false);
  });
  it('emails are trimmed and lower-cased', () => {
    expect(emailSchema.parse('  Juan@Example.INVALID ')).toBe('juan@example.invalid');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
  it('URL filters fall back to "all" for unknown values', () => {
    expect(contentFiltersSchema.parse({ type: 'user', status: 'gone', q: undefined })).toEqual({});
    expect(contentFiltersSchema.parse({ type: 'post', status: 'removed', q: ' #12 ' })).toEqual({ type: 'post', status: 'removed', q: '#12' });
    expect(userFiltersSchema.parse({ deleted: '1', role: 'admin' })).toEqual({ deleted: true, role: 'admin' });
    expect(userFiltersSchema.parse({ deleted: 'yes' })).toEqual({ deleted: false });
  });
  it('load-more keeps the parsed user filters (deleted stays a boolean)', () => {
    expect(userFiltersValueSchema.parse({ deleted: true, status: 'banned' })).toEqual({ deleted: true, status: 'banned' });
  });
  it('history queries are either one item or one user', () => {
    const cursor = { ts: '2026-10-27T08:00:00Z', id: U2 };
    expect(historyQuerySchema.safeParse({ kind: 'target', type: 'post', id: U1, cursor }).success).toBe(true);
    expect(historyQuerySchema.safeParse({ kind: 'user', user: U1, cursor }).success).toBe(true);
    expect(historyQuerySchema.safeParse({ kind: 'user', cursor }).success).toBe(false);
  });
});

// ------------------------------------------------------------ errors and labels

describe('error mapping for the moderation RPCs', () => {
  it.each([
    'account_deleted',
    'cannot_target_self',
    'cannot_target_admin',
    'invalid_until',
    'account_not_restricted',
    'reason_required',
    'reason_too_long',
    'invalid_email',
    'nickname_invalid',
    'nickname_taken',
    'invalid_transition',
    'not_found',
  ])('%s maps to its own message', (code) => {
    expect(codeFromError({ code: 'P0001', message: code })).toBe(code);
    expect(messageFor(code)).not.toBe(messageFor('unknown'));
  });
  it('maps a unique-index race on nicknames to nickname_taken', () => {
    expect(codeFromError({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_nickname_key"' })).toBe('nickname_taken');
    expect(codeFromError({ code: '23505', message: 'duplicate key value violates unique constraint "other"' })).toBe('unknown');
  });
  it('has messages for the panel-side checks', () => {
    for (const code of ['no_user_with_email', 'confirm_mismatch', 'cannot_restore_deleted', 'identity_unavailable']) {
      expect(messageFor(code)).not.toBe(messageFor('unknown'));
    }
  });
  it('labels report reasons and log actions', () => {
    expect(reportReasonLabel('prohibited_item')).toBe('Prohibited item');
    expect(reportReasonLabel('weird')).toBe('weird');
    expect(moderationActionLabel('restore_user')).toBe('Account restored');
  });
});

// ------------------------------------------------------------ Module 7d.3

describe('content by author (mod_list_content p_author)', () => {
  it('passes the author through with the other filters and the cursor', () => {
    const cursor = { ts: '2026-10-27T08:00:00+00:00', id: U2 };
    expect(contentListArgs({ author: U1, type: 'comment', status: 'removed' }, 30, cursor)).toEqual({
      p_limit: 30,
      p_type: 'comment',
      p_status: 'removed',
      p_author: U1,
      p_after_ts: cursor.ts,
      p_after_id: U2,
    });
  });
  it('leaves p_author out when no author is set (the Content page)', () => {
    expect(contentListArgs({ q: '#12' }, 30)).toEqual({ p_limit: 30, p_search: '#12' });
  });
  it('the filter schema keeps a valid author id and drops anything else', () => {
    expect(contentFiltersSchema.parse({ author: U1 }).author).toBe(U1);
    expect(contentFiltersSchema.parse({ author: 'someone@example.invalid' }).author).toBeUndefined();
  });
});

describe('7d.2 error codes', () => {
  it('deleted_by_author (mod_review restore) has its own message', () => {
    expect(codeFromError({ code: 'P0001', message: 'deleted_by_author' })).toBe('deleted_by_author');
    expect(messageFor('deleted_by_author')).toBe('The author deleted this themselves, so it cannot be restored.');
  });
  it('account_deleted from admin_set_nickname gets the nickname wording; elsewhere it stays generic', () => {
    expect(renameErrorCode(codeFromError({ code: 'P0001', message: 'account_deleted' }))).toBe('nickname_account_deleted');
    expect(messageFor('nickname_account_deleted')).toBe('This account was deleted, so its nickname cannot be changed.');
    expect(messageFor('account_deleted')).toBe('This account has been deleted.');
    expect(renameErrorCode('nickname_taken')).toBe('nickname_taken');
  });
});

describe('content actions availability', () => {
  it('offers Restore for a removed or rejected item the author did not delete', () => {
    expect(contentActions({ type: 'post', status: 'removed', deletedByAuthor: false })).toMatchObject({ restore: true, deletedNote: false });
    expect(contentActions({ type: 'listing', status: 'rejected', deletedByAuthor: false })).toMatchObject({ restore: true });
  });
  it('hides Restore and shows "Deleted by author" when deleted_at is set', () => {
    expect(contentActions({ type: 'comment', status: 'removed', deletedByAuthor: true })).toEqual({
      remove: false,
      edit: false,
      restore: false,
      deletedNote: true,
    });
  });
  it('published items: Remove, and Edit for posts and comments only', () => {
    expect(contentActions({ type: 'post', status: 'published', deletedByAuthor: false })).toMatchObject({ remove: true, edit: true, restore: false });
    expect(contentActions({ type: 'listing', status: 'published', deletedByAuthor: false })).toMatchObject({ remove: true, edit: false });
  });
  it('the nickname control is hidden for a deleted account', () => {
    const deleted: TargetUser = { id: 'gone', role: 'user', status: 'active', suspendedUntil: null, deleted: true };
    expect(userActions({ id: 'admin-1', isAdmin: true }, deleted, NOW).rename).toBe(false);
    expect(userActions({ id: 'admin-1', isAdmin: true }, { ...deleted, deleted: false }, NOW).rename).toBe(true);
  });
});

// ------------------------------------------------------------ guards

describe('every Module 7d page and action checks access on the server', () => {
  const src = (path: string) => readFileSync(fileURLToPath(new URL(`../app/(panel)/${path}`, import.meta.url)), 'utf8');

  it.each([
    'reports/page.tsx',
    'reports/[type]/[id]/page.tsx',
    'reports/next/page.tsx',
    'content/page.tsx',
    'content/[type]/[id]/page.tsx',
    'users/page.tsx',
    'users/[id]/page.tsx',
  ])('%s calls requireStaff()', (file) => {
    expect(src(file)).toMatch(/await requireStaff\(\)/);
  });

  const firstStatements = (file: string) =>
    Object.fromEntries([...src(file).matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*([^\n]*)/g)].map((m) => [m[1], m[2]]));

  it('reports and content actions call requireStaff() first', () => {
    const all = { ...firstStatements('reports/actions.ts'), ...firstStatements('content/actions.ts') };
    expect(Object.keys(all).sort()).toEqual(['editPublished', 'loadMoreContent', 'loadMoreHistory', 'loadMoreReports', 'removePublished', 'resolveReports', 'restoreRemoved']);
    for (const [name, first] of Object.entries(all)) expect(first, name).toBe('await requireStaff();');
  });

  it('user actions: staff actions call requireStaff(), admin-only ones call requireAdmin()', () => {
    const actions = firstStatements('users/actions.ts');
    const adminOnly = ['setUserRole', 'renameUser', 'revealIdentity', 'deleteAccount', 'findUserByEmail'];
    const staff = ['loadMoreUsers', 'suspendUser', 'banUser', 'restoreUser', 'removeAvatar'];
    expect(Object.keys(actions).sort()).toEqual([...adminOnly, ...staff].sort());
    for (const name of adminOnly) expect(actions[name], name).toBe('await requireAdmin();');
    for (const name of staff) expect(actions[name], name).toBe('await requireStaff();');
  });
});
