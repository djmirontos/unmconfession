import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NAV_ITEMS } from '@/lib/access';
import { messageFor } from '@/lib/errors';
import {
  buildTranscript,
  CHAT_REPORT_OUTCOMES,
  chatReportActions,
  chatReportBadge,
  chatReportIdSchema,
  chatReportReasonLabel,
  chatReportStatusSchema,
  isRestrictedFor,
  outcomeAfter,
  outcomeLabel,
  resolveChatReportSchema,
  resolveInputError,
} from '@/lib/moderation/chat-reports';
import { auditActionLabel } from '@/lib/moderation/log';

// Chat reports in the panel (20261107160000_chat_reports.sql).

const R = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('labels', () => {
  it('reasons and outcomes', () => {
    expect(['harassment', 'spam_scam', 'sexual_content', 'threats', 'child_safety', 'other'].map(chatReportReasonLabel)).toEqual([
      'Harassment or bullying',
      'Spam or scam',
      'Sexual content',
      'Threats or violence',
      'Child safety',
      'Something else',
    ]);
    expect(chatReportReasonLabel('new_reason')).toBe('new_reason');
    expect(CHAT_REPORT_OUTCOMES.map((o) => o.value)).toEqual(['dismissed', 'warned', 'muted', 'banned', 'other']);
    expect(outcomeLabel('muted')).toBe('Muted');
    expect(outcomeLabel(null)).toBeNull();
    expect(outcomeAfter('warn')).toBe('warned');
    expect(outcomeAfter('mute')).toBe('muted');
  });
  it('the audit log names the new actions', () => {
    expect(auditActionLabel('view_chat_report')).toBe('Opened a chat report');
    expect(auditActionLabel('escalate_chat_report')).toBe('Escalated a chat report to admins');
    expect(auditActionLabel('release_chat_hold')).toBe('Released a chat report hold');
  });
});

describe('input', () => {
  it('status falls back to open; ids are uuids', () => {
    expect(chatReportStatusSchema.parse('dismissed')).toBe('dismissed');
    expect(chatReportStatusSchema.parse('bogus')).toBe('open');
    expect(chatReportStatusSchema.parse(undefined)).toBe('open');
    expect(chatReportIdSchema.safeParse(R).success).toBe(true);
    expect(chatReportIdSchema.safeParse('x').success).toBe(false);
  });
  it('resolve: a listed outcome and a note up to 300', () => {
    expect(resolveChatReportSchema.safeParse({ report: R, outcome: 'warned' }).success).toBe(true);
    expect(resolveChatReportSchema.safeParse({ report: R, outcome: 'warned', note: 'a'.repeat(300) }).success).toBe(true);
    const err = (input: unknown) => {
      const r = resolveChatReportSchema.safeParse(input);
      return r.success ? null : resolveInputError(r.error.issues);
    };
    expect(err({ report: R, outcome: 'nuked' })).toBe('invalid_outcome');
    expect(err({ report: R, outcome: 'other', note: 'a'.repeat(301) })).toBe('note_too_long');
    expect(err({ report: 'x', outcome: 'other' })).toBe('invalid_input');
  });
  it('errors map to friendly texts', () => {
    expect(messageFor('already_resolved')).toBe('This report was already resolved.');
    expect(messageFor('invalid_outcome')).toBe('Pick an outcome from the list.');
    for (const code of ['forbidden', 'not_found', 'note_too_long']) expect(messageFor(code)).not.toBe(messageFor('unknown'));
  });
});

describe('who may see and act', () => {
  it('a moderator cannot open an admin-only row; an admin can', () => {
    expect(isRestrictedFor({ isAdmin: false }, { adminOnly: true })).toBe(true);
    expect(isRestrictedFor({ isAdmin: true }, { adminOnly: true })).toBe(false);
    expect(isRestrictedFor({ isAdmin: false }, { adminOnly: false })).toBe(false);
  });
  it('actions while open; escalate until admin-only; release for admins on held reports', () => {
    const mod = { isAdmin: false };
    const admin = { isAdmin: true };
    expect(chatReportActions(mod, { status: 'open', adminOnly: false, held: false })).toEqual({ resolve: true, escalate: true, release: false, discipline: true });
    expect(chatReportActions(mod, { status: 'open', adminOnly: true, held: true })).toEqual({ resolve: false, escalate: false, release: false, discipline: false });
    expect(chatReportActions(admin, { status: 'open', adminOnly: true, held: true })).toEqual({ resolve: true, escalate: false, release: true, discipline: true });
    expect(chatReportActions(admin, { status: 'actioned', adminOnly: false, held: true })).toEqual({ resolve: false, escalate: false, release: true, discipline: false });
    expect(chatReportActions(admin, { status: 'dismissed', adminOnly: false, held: false })).toEqual({ resolve: false, escalate: false, release: false, discipline: false });
  });
  it('the badge hides on a failed count', () => {
    expect(chatReportBadge(null)).toBe(0);
    expect(chatReportBadge(0)).toBe(0);
    expect(chatReportBadge(4)).toBe(4);
    expect(src('lib/moderation/chat-report-data.ts')).toMatch(/return error \? null : data;/);
  });
});

describe('the transcript', () => {
  const snapshot = [
    { id: 'a', from: 'reporter', at: '2026-11-07T10:00:00Z', body: 'hi', deleted: false, reported: false },
    { id: 'b', from: 'reported', at: '2026-11-07T10:01:00Z', body: '<b>bad</b> & worse', deleted: false, reported: true },
    { id: 'c', from: 'reported', at: '2026-11-07T10:02:00Z', body: null, deleted: true, reported: false },
    { id: null, from: 'reported', at: '2026-11-07T09:00:00Z', body: 'request text', deleted: false, reported: true },
  ];
  it('labels, highlight, deleted placeholder, plain text kept as is', () => {
    const lines = buildTranscript(snapshot, { reporter: 'ana', reported: 'ben' });
    expect(lines?.map((l) => l.sender)).toEqual(['Reporter (ana)', 'Reported (ben)', 'Reported (ben)', 'Reported (ben)']);
    expect(lines?.map((l) => l.highlighted)).toEqual([false, true, false, true]);
    expect(lines?.[1]?.body).toBe('<b>bad</b> & worse');
    expect(lines?.[2]).toMatchObject({ deleted: true, body: null });
    expect(lines?.[3]?.key).toBe('line-3');
    expect(buildTranscript(snapshot, { reporter: null, reported: null })?.[0]?.sender).toBe('Reporter');
  });
  it('malformed evidence gives null, not a partial transcript', () => {
    expect(buildTranscript('nope', { reporter: null, reported: null })).toBeNull();
    expect(buildTranscript([{ id: 'a', from: 'admin', at: 'x', body: 'x', deleted: false, reported: false }], { reporter: null, reported: null })).toBeNull();
    expect(buildTranscript([], { reporter: null, reported: null })).toEqual([]);
  });
  it('bodies render as React text only, with the "message deleted" placeholder', () => {
    const view = src('components/chat-reports/chat-report-view.tsx');
    expect(view).not.toMatch(/dangerouslySetInnerHTML/);
    expect(view).toMatch(/whitespace-pre-wrap break-words">\{l\.body\}<\/p>/);
    expect(view).toMatch(/message deleted/);
  });
});

describe('one audit row per navigation', () => {
  it('the detail page opens the report once and has a static title', () => {
    const page = src('app/(panel)/chat-reports/[id]/page.tsx');
    expect(page.split('fetchChatReport(').length - 1).toBe(1);
    expect(page).not.toMatch(/export (async )?function generateMetadata/);
    expect(page).toMatch(/export const metadata: Metadata = \{ title: 'Chat report' \};/);
    expect(src('lib/moderation/chat-report-data.ts').split("rpc('mod_get_chat_report'").length - 1).toBe(1);
  });
  it('the list never opens a report and its links do not prefetch', () => {
    const list = src('components/chat-reports/chat-report-list.tsx');
    expect(list).toMatch(/prefetch=\{false\}/);
    expect(list).not.toMatch(/fetchChatReport|mod_get_chat_report\b/);
    expect(src('app/(panel)/chat-reports/page.tsx')).not.toMatch(/fetchChatReport\(/);
  });
  it('the report page never refreshes itself; actions revalidate only the list and the member page', () => {
    const view = src('components/chat-reports/chat-report-view.tsx');
    expect(view).not.toMatch(/router\.refresh|useRouter/);
    const actions = src('app/(panel)/chat-reports/actions.ts');
    expect(actions).not.toMatch(/refreshPanel/);
    expect(actions).not.toMatch(/revalidatePath\(['`]\/chat-reports\/|revalidatePath\('\/', 'layout'\)/);
    expect(actions).toMatch(/revalidatePath\('\/chat-reports'\);/);
    // Back to the list after a change: one refresh there (badge included), never here.
    expect(view).toMatch(/changed \? '\/chat-reports\?updated=1' : '\/chat-reports'/);
    expect(src('components/chat-reports/refresh-once.tsx')).toMatch(/router\.refresh\(\);/);
  });
});

describe('server actions and navigation', () => {
  const actions = src('app/(panel)/chat-reports/actions.ts');
  it.each([
    ['loadMoreChatReports', 'requireStaff'],
    ['escalateChatReport', 'requireStaff'],
    ['resolveChatReport', 'requireStaff'],
    ['releaseChatReportHold', 'requireAdmin'],
    ['warnReportedMember', 'requireStaff'],
    ['muteReportedMember', 'requireStaff'],
  ])('%s calls %s first', (name, guard) => {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`));
    const firstLine = body.split('\n')[1]?.trim();
    expect(firstLine).toBe(`await ${guard}();`);
  });
  it('warn and mute reuse the shared helper (no duplicate RPC calls here)', () => {
    expect(actions).toMatch(/await warnMember\(input\)/);
    expect(actions).toMatch(/await muteMember\(input\)/);
    expect(actions).not.toMatch(/mod_warn_user|mod_mute_user/);
  });
  it('nothing logs report content', () => {
    for (const path of ['app/(panel)/chat-reports/actions.ts', 'lib/moderation/chat-report-data.ts', 'components/chat-reports/chat-report-view.tsx']) {
      expect(src(path)).not.toMatch(/console\./);
    }
  });
  it('the sidebar has a staff "Chat reports" entry with its own badge', () => {
    expect(NAV_ITEMS.find((n) => n.href === '/chat-reports')).toMatchObject({ label: 'Chat reports', icon: 'chatReports', access: 'staff' });
    expect(src('lib/dashboard.ts')).toMatch(/chatReports: chatReportBadge\(chatReports\)/);
  });
});
