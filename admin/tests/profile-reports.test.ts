import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { messageFor, removeAvatarErrorCode } from '@/lib/errors';
import {
  AVATAR_REASON_MAX,
  avatarReasonFromReports,
  avatarUrl,
  canRemoveAvatar,
  isCustomAvatarKey,
  removeAvatarSchema,
} from '@/lib/moderation/avatar';
import { keysetPage } from '@/lib/moderation/keyset';
import { moderationActionLabel } from '@/lib/moderation/labels';
import { targetHref, targetTypeLabel } from '@/lib/moderation/log';
import { resolveSchema } from '@/lib/moderation/schemas';
import { keyOf, pickNextAfterAction, type QueueEntry } from '@/lib/review/queue';
import { isContentType, reportFilterSchema, reportTargetSchema, targetSchema } from '@/lib/review/schemas';

// Module 12c-2: reported profiles and Remove avatar.

const U1 = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const U2 = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const URL_ = 'https://abcdefghij.supabase.co';

describe('avatar keys and URLs', () => {
  it('only c_ + 12 hex is a custom picture', () => {
    expect(isCustomAvatarKey('c_0123456789ab')).toBe(true);
    expect(isCustomAvatarKey('avatar_01')).toBe(false);
    expect(isCustomAvatarKey('em_cat')).toBe(false);
    expect(isCustomAvatarKey('c_0123456789AB')).toBe(false);
    expect(isCustomAvatarKey('c_0123456789ab/../x')).toBe(false);
    expect(isCustomAvatarKey(null)).toBe(false);
  });
  it('builds the public avatars URL for a custom key, null for presets or bad ids', () => {
    expect(avatarUrl(U1, 'c_0123456789ab', `${URL_}/`)).toBe(`${URL_}/storage/v1/object/public/avatars/${U1}/c_0123456789ab.jpg`);
    expect(avatarUrl(U1, 'avatar_03', URL_)).toBeNull();
    expect(avatarUrl('not-a-uuid', 'c_0123456789ab', URL_)).toBeNull();
  });
});

describe('Remove avatar', () => {
  const user = { role: 'user' as const, deleted: false, avatarKey: 'c_0123456789ab' };
  it('mirrors mod_remove_avatar: moderators on regular users, admins on anyone', () => {
    expect(canRemoveAvatar({ isAdmin: false }, user)).toBe(true);
    expect(canRemoveAvatar({ isAdmin: false }, { ...user, role: 'moderator' })).toBe(false);
    expect(canRemoveAvatar({ isAdmin: true }, { ...user, role: 'admin' })).toBe(true);
  });
  it('needs a custom picture on a live account', () => {
    expect(canRemoveAvatar({ isAdmin: true }, { ...user, avatarKey: 'avatar_01' })).toBe(false);
    expect(canRemoveAvatar({ isAdmin: true }, { ...user, deleted: true })).toBe(false);
  });
  it('validates the input: a user id and an optional reason up to the limit', () => {
    expect(removeAvatarSchema.safeParse({ user: U1 }).success).toBe(true);
    expect(removeAvatarSchema.safeParse({ user: U1, reason: 'Reported: Spam' }).success).toBe(true);
    expect(removeAvatarSchema.safeParse({ user: 'x' }).success).toBe(false);
    expect(removeAvatarSchema.safeParse({ user: U1, reason: 'a'.repeat(AVATAR_REASON_MAX + 1) }).success).toBe(false);
  });
  it('prefills the reason from the report reasons', () => {
    expect(avatarReasonFromReports(['Spam', 'Bullying or harassment'])).toBe('Reported: Spam, Bullying or harassment');
    expect(avatarReasonFromReports([])).toBe('');
  });
  it('maps its errors to avatar wording', () => {
    expect(messageFor(removeAvatarErrorCode('forbidden'))).toMatch(/Only an admin/);
    expect(messageFor(removeAvatarErrorCode('account_deleted'))).toMatch(/deleted/);
    expect(messageFor(removeAvatarErrorCode('no_custom_avatar'))).toMatch(/no custom profile picture/);
    expect(removeAvatarErrorCode('network')).toBe('network');
  });
  it('the action checks staff access first and calls mod_remove_avatar', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/(panel)/users/actions.ts', import.meta.url)), 'utf8');
    const body = src.slice(src.indexOf('export async function removeAvatar('));
    expect(body).toMatch(/^export async function removeAvatar\(input: unknown\)[^{]*\{\s*await requireStaff\(\);/);
    expect(body.slice(0, body.indexOf('\n}'))).toContain("rpc('mod_remove_avatar'");
  });
});

describe('profile report targets', () => {
  it('reports and resolve accept profile; content actions do not', () => {
    expect(reportTargetSchema.safeParse({ type: 'profile', id: U1 }).success).toBe(true);
    expect(resolveSchema.safeParse({ type: 'profile', id: U1, status: 'actioned' }).success).toBe(true);
    expect(targetSchema.safeParse({ type: 'profile', id: U1 }).success).toBe(false);
    expect(isContentType('profile')).toBe(false);
    expect(isContentType('listing')).toBe(true);
  });
  it('the reports filter has a profile chip; unknown values fall back to all', () => {
    expect(reportFilterSchema.parse('profile')).toBe('profile');
    expect(reportFilterSchema.parse('user')).toBeUndefined();
  });
  it('next reported item can be a profile and the filter keeps to profiles', () => {
    const e = (type: QueueEntry['target_type'], id: string, at: string): QueueEntry => ({ target_type: type, target_id: id, created_at: at });
    const head = [e('post', U1, '2026-10-29T01:00:00Z'), e('profile', U2, '2026-10-29T02:00:00Z')];
    expect(pickNextAfterAction([], head, keyOf(head[0]))?.target_type).toBe('profile');
    expect(pickNextAfterAction([], head, 'none', 'profile')?.target_id).toBe(U2);
  });
  it('the profile report page never loads content', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/(panel)/reports/[type]/[id]/page.tsx', import.meta.url)), 'utf8');
    const profile = src.slice(src.indexOf("if (type === 'profile')"), src.indexOf('const [loaded, reports]'));
    expect(profile).toContain('fetchUser(id)');
    expect(profile).not.toContain('loadContent');
  });
});

describe('moderation log', () => {
  it('labels remove_avatar; user targets are accounts linking to the user page', () => {
    expect(moderationActionLabel('remove_avatar')).toBe('Removed profile picture');
    expect(targetTypeLabel('user')).toBe('Account');
    expect(targetHref('user', U1)).toBe(`/users/${U1}`);
  });
});

describe('keysetPage', () => {
  it('drops rows mapped to null but keeps the cursor of the last raw row', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ i, ts: `2026-10-29T0${i}:00:00Z`, id: U1 }));
    const result = keysetPage(rows, (r) => (r.i === 2 ? null : r.i), (r) => ({ ts: r.ts, id: r.id }), 3);
    expect(result.rows).toEqual([0, 1]);
    expect(result.nextCursor?.ts).toBe('2026-10-29T02:00:00Z');
  });
});
