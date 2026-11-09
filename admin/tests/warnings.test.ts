import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { messageFor } from '@/lib/errors';
import type { TargetUser, Viewer } from '@/lib/moderation/availability';
import { moderationActionLabel } from '@/lib/moderation/labels';
import {
  disciplineActions,
  hasStrikes,
  logReasonLabel,
  MUTE_PRESETS,
  muteSchema,
  WARNING_NOTE_MAX,
  WARNING_REASONS,
  warningInputError,
  warningReasonLabel,
  warnSchema,
} from '@/lib/moderation/warnings';

// Warnings, strikes and mute (20261106120000_warnings_strikes.sql).

const U1 = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const NOW = Date.parse('2026-11-06T00:00:00Z');
const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('reasons and presets', () => {
  it('the fixed list from _warning_reason_ok, with labels', () => {
    expect(WARNING_REASONS.map((r) => r.value)).toEqual(['harassment', 'spam_scam', 'sexual_content', 'threats', 'filter_evasion', 'other']);
    expect(WARNING_REASONS.map((r) => r.label)).toEqual(['Harassment', 'Spam or scam', 'Sexual content', 'Threats', 'Filter evasion', 'Other']);
    expect(warningReasonLabel('spam_scam')).toBe('Spam or scam');
    expect(warningReasonLabel('typed by hand')).toBe('typed by hand');
  });
  it('mute presets inside 1..720 hours', () => {
    expect(MUTE_PRESETS.map((p) => p.hours)).toEqual([1, 24, 168, 720]);
  });
});

describe('validation', () => {
  it('warn: uuid, a listed reason, an optional note up to 300', () => {
    expect(warnSchema.safeParse({ user: U1, reason: 'threats' }).success).toBe(true);
    expect(warnSchema.safeParse({ user: U1, reason: 'threats', note: 'a'.repeat(WARNING_NOTE_MAX) }).success).toBe(true);
    expect(warnSchema.safeParse({ user: U1, reason: 'threats', note: 'a'.repeat(WARNING_NOTE_MAX + 1) }).success).toBe(false);
    expect(warnSchema.safeParse({ user: U1, reason: 'rude' }).success).toBe(false);
    expect(warnSchema.safeParse({ user: 'x', reason: 'threats' }).success).toBe(false);
  });
  it('mute: whole hours from 1 to 720', () => {
    expect(muteSchema.safeParse({ user: U1, hours: 1, reason: 'other' }).success).toBe(true);
    expect(muteSchema.safeParse({ user: U1, hours: 720, reason: 'other' }).success).toBe(true);
    for (const hours of [0, 721, 1.5, -1]) expect(muteSchema.safeParse({ user: U1, hours, reason: 'other' }).success).toBe(false);
  });
  it('a failed parse becomes the matching code', () => {
    const issue = (input: unknown) => {
      const r = muteSchema.safeParse(input);
      return r.success ? null : warningInputError(r.error.issues);
    };
    expect(issue({ user: U1, hours: 24, reason: 'nope' })).toBe('invalid_reason');
    expect(issue({ user: U1, hours: 24, reason: 'other', note: 'a'.repeat(301) })).toBe('note_too_long');
    expect(issue({ user: U1, hours: 9999, reason: 'other' })).toBe('invalid_duration');
    expect(issue({ user: 'x', hours: 24, reason: 'other' })).toBe('invalid_input');
  });
});

describe('who may warn or mute (mirrors the database)', () => {
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
  it('moderators: regular members only', () => {
    expect(disciplineActions(mod, target(), NOW)).toEqual({ warn: true, mute: true, muteBlocked: false });
    expect(disciplineActions(mod, target({ role: 'moderator' }), NOW)).toEqual({ warn: false, mute: false, muteBlocked: false });
  });
  it('admins: moderators too; nobody acts on admins or themselves or deleted accounts', () => {
    expect(disciplineActions(admin, target({ role: 'moderator' }), NOW).warn).toBe(true);
    expect(disciplineActions(admin, target({ role: 'admin' }), NOW).warn).toBe(false);
    expect(disciplineActions(admin, target({ id: 'admin-1', role: 'admin' }), NOW).warn).toBe(false);
    expect(disciplineActions(mod, target({ id: 'mod-1', role: 'moderator' }), NOW).warn).toBe(false);
    expect(disciplineActions(admin, target({ deleted: true }), NOW)).toEqual({ warn: false, mute: false, muteBlocked: false });
  });
  it('mute is blocked (not hidden) while banned or actively suspended; an ended suspension allows it', () => {
    expect(disciplineActions(mod, target({ status: 'banned' }), NOW)).toEqual({ warn: true, mute: false, muteBlocked: true });
    expect(disciplineActions(mod, target({ status: 'suspended', suspendedUntil: '2026-11-07T00:00:00Z' }), NOW).muteBlocked).toBe(true);
    expect(disciplineActions(mod, target({ status: 'suspended', suspendedUntil: '2026-11-05T00:00:00Z' }), NOW).mute).toBe(true);
  });
});

describe('errors, log and strikes', () => {
  it('maps the RPC codes to friendly text', () => {
    expect(messageFor('invalid_reason')).toBe('Pick a reason from the list.');
    expect(messageFor('invalid_duration')).toBe('Pick a mute length between 1 hour and 30 days.');
    expect(messageFor('note_too_long')).toBe('The note is too long (300 characters at most).');
    expect(messageFor('already_restricted')).toMatch(/Restore the account first/);
    for (const code of ['forbidden', 'cannot_target_self', 'cannot_target_admin', 'not_found']) expect(messageFor(code)).not.toBe(messageFor('unknown'));
  });
  it("the log labels 'warn' and shows warning reasons as labels", () => {
    expect(moderationActionLabel('warn')).toBe('Warned');
    expect(logReasonLabel('warn', 'filter_evasion')).toBe('Filter evasion');
    expect(logReasonLabel('suspend', 'threats')).toBe('Threats');
    expect(logReasonLabel('suspend', 'Spamming the feed')).toBe('Spamming the feed');
    expect(logReasonLabel('remove', 'spam')).toBe('spam');
    expect(logReasonLabel('warn', null)).toBeNull();
  });
  it('"No strikes" only when nothing is left', () => {
    const zero = { keywordHits30: 0, keywordHits90: 0, warnings30: 0, warnings90: 0, mutes30: 0, mutes90: 0, lastStrikeAt: null };
    expect(hasStrikes(zero)).toBe(false);
    expect(hasStrikes({ ...zero, keywordHits90: 1 })).toBe(true);
    expect(hasStrikes({ ...zero, lastStrikeAt: '2026-06-01T00:00:00Z' })).toBe(true);
  });
});

describe('server actions and page', () => {
  const s = src('app/(panel)/users/actions.ts');
  // The validation and the RPC live in lib/moderation/discipline.ts, shared with the chat report page.
  const helper = src('lib/moderation/discipline.ts');
  for (const [name, fnName, rpc] of [
    ['warnUser', 'warnMember', 'mod_warn_user'],
    ['muteUser', 'muteMember', 'mod_mute_user'],
  ] as const) {
    it(`${name}: staff check first, then the shared ${fnName} (zod, ${rpc}), then refreshPanel`, () => {
      const body = s.slice(s.indexOf(`export async function ${name}(`));
      const fn = body.slice(0, body.indexOf('\n}'));
      expect(fn.indexOf('await requireStaff();')).toBeGreaterThan(0);
      expect(fn.indexOf('await requireStaff();')).toBeLessThan(fn.indexOf(`await ${fnName}(input)`));
      expect(fn).toMatch(/if \(result\.ok\) refreshPanel\(\);/);
      const shared = helper.slice(helper.indexOf(`export async function ${fnName}(`));
      const h = shared.slice(0, shared.indexOf('\n}'));
      expect(h.indexOf('safeParse(input)')).toBeGreaterThan(0);
      expect(h.indexOf('safeParse(input)')).toBeLessThan(h.indexOf(`rpc('${rpc}'`));
    });
  }
  it('the user page shows the strikes card and passes the discipline actions', () => {
    const page = src('app/(panel)/users/[id]/page.tsx');
    expect(page).toMatch(/<StrikesCard user=\{user\.id\} \/>/);
    expect(page).toMatch(/discipline=\{discipline\}/);
    const card = src('components/users/strikes-card.tsx');
    expect(card).toMatch(/Nothing happens automatically/);
    expect(card).toMatch(/No strikes/);
  });
  it('the dialogs say the member never sees the sender', () => {
    const ui = src('components/users/discipline-dialogs.tsx');
    expect(ui.split('The member sees the reason and your note, never your name.').length - 1).toBe(2);
    expect(ui).toMatch(/The member can still read but cannot post, comment, react or chat until it ends\./);
  });
});
