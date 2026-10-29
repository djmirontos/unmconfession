import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clearDetailsErrorCode, messageFor } from '@/lib/errors';
import { matchProfile } from '@/lib/keywords/match';
import { keywordFiltersSchema, keywordInputSchema, SCOPE_LABELS, SCOPES } from '@/lib/keywords/schemas';
import { canClearDetails, clearDetailsSchema, PROFILE_REASON_MAX } from '@/lib/moderation/avatar';
import { moderationActionLabel } from '@/lib/moderation/labels';

// Module 12d: profile details in the panel.

const U1 = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('Clear details', () => {
  const user = { role: 'user' as const, deleted: false };
  it('mirrors mod_clear_profile_details: details on a live account; moderators on regular users only', () => {
    expect(canClearDetails({ isAdmin: false }, user, 'College: CAS')).toBe(true);
    expect(canClearDetails({ isAdmin: false }, user, null)).toBe(false);
    expect(canClearDetails({ isAdmin: false }, user, '   ')).toBe(false);
    expect(canClearDetails({ isAdmin: false }, { ...user, role: 'moderator' }, 'College: CAS')).toBe(false);
    expect(canClearDetails({ isAdmin: true }, { ...user, role: 'admin' }, 'College: CAS')).toBe(true);
    expect(canClearDetails({ isAdmin: true }, { ...user, deleted: true }, 'College: CAS')).toBe(false);
  });
  it('validates a user id and an optional reason up to 300 characters', () => {
    expect(clearDetailsSchema.safeParse({ user: U1, reason: 'Reported: Spam' }).success).toBe(true);
    expect(clearDetailsSchema.safeParse({ user: 'x' }).success).toBe(false);
    expect(clearDetailsSchema.safeParse({ user: U1, reason: 'a'.repeat(PROFILE_REASON_MAX + 1) }).success).toBe(false);
  });
  it('maps its errors', () => {
    expect(messageFor(clearDetailsErrorCode('forbidden'))).toBe("Only an admin can clear a moderator's or admin's profile details.");
    expect(messageFor(clearDetailsErrorCode('no_details'))).toBe('This member has no profile details to clear.');
    expect(messageFor(clearDetailsErrorCode('account_deleted'))).toBe(messageFor('account_deleted'));
  });
  it('the action checks staff access first, validates, calls the RPC and refreshes the panel', () => {
    const s = src('app/(panel)/users/actions.ts');
    const body = s.slice(s.indexOf('export async function clearProfileDetails('));
    const fn = body.slice(0, body.indexOf('\n}'));
    expect(fn).toMatch(/^export async function clearProfileDetails\(input: unknown\)[^{]*\{\s*await requireStaff\(\);/);
    expect(fn).toContain('clearDetailsSchema.safeParse(input)');
    expect(fn).toContain("rpc('mod_clear_profile_details'");
    expect(fn).toContain('refreshPanel()');
    expect(fn).not.toContain('mod_resolve_report');
  });
  it('the report page shows the details as plain text in a labelled block', () => {
    const s = src('components/reports/profile-report.tsx');
    expect(s).toContain('Profile details (may be hidden from members)');
    expect(s).toContain('whitespace-pre-wrap');
    expect(s).not.toContain('dangerouslySetInnerHTML');
  });
  it('the log labels clear_details', () => {
    expect(moderationActionLabel('clear_details')).toBe('Cleared profile details');
  });
});

describe('profile keyword scope', () => {
  it('is listed, labelled, accepted by the form and the filter', () => {
    expect(SCOPES).toContain('profile');
    expect(SCOPE_LABELS.profile).toBe('Profile details');
    const valid = { term: 'shabu', match_type: 'word', category: 'prohibited_item', applies_to: ['profile'], active: true };
    expect(keywordInputSchema.safeParse(valid).success).toBe(true);
    expect(keywordFiltersSchema.parse({ scope: 'profile' }).scope).toBe('profile');
  });
  it('preview mirrors _profile_text_flagged (leet digits on text and term)', () => {
    expect(matchProfile('shabu', 'word', 'I like 5habu')).toEqual({ kind: 'match' });
    expect(matchProfile('shabu', 'word', 'shabuhan')).toEqual({ kind: 'no-match' });
    expect(matchProfile('bad', 'contains', 'so B4Dly')).toEqual({ kind: 'match' });
    expect(matchProfile('ba+d', 'regex', 'baad')).toEqual({ kind: 'match' });
    expect(matchProfile('(', 'regex', 'x')).toEqual({ kind: 'invalid' });
  });
});
