import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DASHBOARD_LINKS } from '@/lib/dashboard-links';
import { navFor } from '@/lib/access';
import { afterArgs, keysetPage } from '@/lib/moderation/keyset';
import { moderationActionLabel } from '@/lib/moderation/labels';
import {
  activeLogFilterCount,
  auditActionLabel,
  auditArgs,
  auditDetail,
  auditLoadSchema,
  LOG_PAGE,
  logActionArgs,
  logFiltersSchema,
  logHrefWithout,
  logLoadSchema,
  targetHref,
  targetTypeLabel,
  userHref,
} from '@/lib/moderation/log';
import { contentFiltersSchema, userFiltersSchema } from '@/lib/moderation/schemas';
import { filterSchema } from '@/lib/review/schemas';
import { withoutParams } from '@/lib/url-params';

const A = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const B = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const TS = '2026-10-27T03:04:05.123456+00:00';
const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

// ------------------------------------------------------------ /log filters → mod_get_actions

describe('moderation log filters', () => {
  it('parses ids and the target type from the URL', () => {
    expect(logFiltersSchema.parse({ target: 'user', actor: A, subject: B })).toEqual({ target: 'user', actor: A, subject: B });
  });
  it('drops bad values instead of failing (not a uuid, unknown type, an email)', () => {
    expect(logFiltersSchema.parse({ target: 'profile', actor: 'mod_anna', subject: 'juan@example.invalid' })).toEqual({});
  });
  it('no filters: only the page size', () => {
    expect(logActionArgs({})).toEqual({ p_limit: LOG_PAGE });
    expect(LOG_PAGE).toBe(30);
  });
  it('each filter becomes its argument, then the cursor', () => {
    expect(logActionArgs({ target: 'comment', actor: A, subject: B }, { ts: TS, id: A })).toEqual({
      p_limit: 30,
      p_target_type: 'comment',
      p_actor: A,
      p_subject_user: B,
      p_after_ts: TS,
      p_after_id: A,
    });
  });
  it('counts only the sheet filters (the subject is a chip)', () => {
    expect(activeLogFilterCount({ subject: B })).toBe(0);
    expect(activeLogFilterCount({ target: 'post', actor: A, subject: B })).toBe(2);
  });
  it('a chip removes only its own filter', () => {
    expect(logHrefWithout({ target: 'post', subject: B }, 'subject')).toBe('/log?target=post');
    expect(logHrefWithout({ subject: B }, 'subject')).toBe('/log');
  });
  it('"Clear" in the sheet keeps the subject', () => {
    expect(withoutParams(`target=post&actor=${A}&subject=${B}`, ['target', 'actor'])).toBe(`subject=${B}`);
  });
  it('"Load more" accepts only parsed filters and a valid cursor', () => {
    expect(logLoadSchema.safeParse({ filters: { actor: A }, cursor: { ts: TS, id: B } }).success).toBe(true);
    expect(logLoadSchema.safeParse({ filters: { actor: 'x' }, cursor: { ts: TS, id: B } }).success).toBe(false);
    expect(logLoadSchema.safeParse({ filters: {}, cursor: { ts: 'yesterday', id: B } }).success).toBe(false);
    expect(auditLoadSchema.safeParse({ cursor: { ts: TS, id: 'nope' } }).success).toBe(false);
  });
});

// ------------------------------------------------------------ cursor

describe('keyset cursor', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, at: `t-${i}` }));
  const cursorOf = (r: { id: string; at: string }) => ({ ts: r.at, id: r.id });

  it('a full page gives the last row as the next cursor', () => {
    expect(keysetPage(rows(3), (r) => r.id, cursorOf, 3)).toEqual({ rows: ['id-0', 'id-1', 'id-2'], nextCursor: { ts: 't-2', id: 'id-2' } });
  });
  it('a short or empty page ends the list', () => {
    expect(keysetPage(rows(2), (r) => r.id, cursorOf, 3).nextCursor).toBeNull();
    expect(keysetPage([], (r: { id: string; at: string }) => r.id, cursorOf, 3)).toEqual({ rows: [], nextCursor: null });
  });
  it('the cursor becomes p_after_ts and p_after_id; none on the first page', () => {
    expect(afterArgs()).toEqual({});
    expect(afterArgs({ ts: TS, id: A })).toEqual({ p_after_ts: TS, p_after_id: A });
    expect(auditArgs({ ts: TS, id: A })).toEqual({ p_limit: 30, p_after_ts: TS, p_after_id: A });
  });
});

// ------------------------------------------------------------ labels and links

describe('action labels', () => {
  it('labels every value of the moderation_actions check constraint', () => {
    const labels = ['approve', 'reject', 'remove', 'restore', 'edit', 'suspend', 'ban', 'restore_user'].map(moderationActionLabel);
    expect(labels).toEqual(['Approved', 'Rejected', 'Removed', 'Restored', 'Edited', 'Suspended', 'Banned', 'Account restored']);
  });
  it('labels the audit actions, including the content-author lookup from identity_audit_log', () => {
    expect(['view_identity', 'find_by_email', 'set_role', 'delete_account', 'view_content_author'].map(auditActionLabel)).toEqual([
      'Viewed identity',
      'Looked up by email',
      'Changed role',
      'Deleted account',
      'Viewed a content author',
    ]);
  });
  it('shows unknown values as they are', () => {
    expect(moderationActionLabel('shadow_ban')).toBe('shadow_ban');
    expect(auditActionLabel('export_data')).toBe('export_data');
    expect(targetTypeLabel('poll')).toBe('poll');
  });
  it('formats the stored audit detail, never anything else', () => {
    expect(auditDetail('set_role', 'user -> moderator')).toBe('Role: user → moderator');
    expect(auditDetail('delete_account', 'Spam account')).toBe('Reason: Spam account');
    expect(auditDetail('find_by_email', 'no match')).toBe('No account matched');
    expect(auditDetail('view_identity', null)).toBeNull();
  });
  it('links targets to the existing detail pages only', () => {
    expect(targetHref('post', A)).toBe(`/content/post/${A}`);
    expect(targetHref('listing', A)).toBe(`/content/listing/${A}`);
    expect(targetHref('user', A)).toBe(`/users/${A}`);
    expect(targetHref('poll', A)).toBeNull();
    expect(targetHref('post', 'not-an-id')).toBeNull();
    expect(targetHref(null, null)).toBeNull();
    expect(userHref(null)).toBeNull();
  });
});

// ------------------------------------------------------------ access

describe('the audit log is admin only', () => {
  it('is hidden from moderators in the nav', () => {
    expect(navFor(false).map((n) => n.href)).not.toContain('/audit');
    expect(navFor(false).map((n) => n.href)).toContain('/log');
    expect(navFor(true).map((n) => n.href)).toContain('/audit');
  });
  it('the page, the loader and the action call requireAdmin()', () => {
    expect(src('app/(panel)/audit/page.tsx')).toMatch(/^\s*await requireAdmin\(\);/m);
    expect(src('app/(panel)/audit/actions.ts')).toMatch(/Promise<ActionResult<Page<AuditRow>>> \{\n\s*await requireAdmin\(\);/);
    expect(src('lib/moderation/data.ts')).toMatch(/fetchAudit\([^)]*\)[^{]*\{\n\s*await requireAdmin\(\);/);
  });
  it('the moderation log page, loader and action call requireStaff()', () => {
    expect(src('app/(panel)/log/page.tsx')).toMatch(/^\s*await requireStaff\(\);/m);
    expect(src('app/(panel)/log/actions.ts')).toMatch(/Promise<ActionResult<Page<LogRow>>> \{\n\s*await requireStaff\(\);/);
    expect(src('lib/moderation/data.ts')).toMatch(/fetchLog\([^)]*\)[^{]*\{\n\s*await requireStaff\(\);/);
  });
  it('a redirect from the guard is never swallowed by the error handling', () => {
    for (const f of ['app/(panel)/log/page.tsx', 'app/(panel)/audit/page.tsx', 'app/(panel)/log/actions.ts', 'app/(panel)/audit/actions.ts']) {
      expect(src(f), f).toContain('unstable_rethrow(e);');
    }
  });
  it('no email field is read or rendered (the rows carry ids and nicknames only)', () => {
    for (const f of ['components/audit/audit-list.tsx', 'components/log/log-list.tsx']) expect(src(f), f).not.toMatch(/\.email\b/);
    const rows = src('lib/moderation/data.ts').split('// ---------------------------------------------------------------- moderation log (/log)')[1] ?? '';
    expect(rows).not.toMatch(/\bemail\??:|\.email\b|p_email/);
  });
});

// ------------------------------------------------------------ dashboard

describe('dashboard tile links', () => {
  const query = (href: string) => Object.fromEntries(new URL(href, 'http://panel').searchParams);

  it('links the review, report, content and account tiles to matching filters', () => {
    expect(DASHBOARD_LINKS.pending_posts).toBe('/review?filter=post');
    expect(DASHBOARD_LINKS.pending_comments).toBe('/review?filter=comment');
    expect(DASHBOARD_LINKS.pending_listings).toBe('/review?filter=listing');
    expect(DASHBOARD_LINKS.reported_items).toBe('/reports');
    expect(DASHBOARD_LINKS.open_reports).toBe('/reports');
    expect(DASHBOARD_LINKS.posts_24h).toBe('/content?type=post');
    expect(DASHBOARD_LINKS.comments_24h).toBe('/content?type=comment');
    expect(DASHBOARD_LINKS.listings_24h).toBe('/content?type=listing');
    expect(DASHBOARD_LINKS.suspended_users).toBe('/users?status=suspended');
    expect(DASHBOARD_LINKS.banned_users).toBe('/users?status=banned');
  });
  it('leaves tiles without an exact filter unlinked', () => {
    expect(DASHBOARD_LINKS.new_users_24h).toBeNull();
    expect(DASHBOARD_LINKS.deleted_accounts).toBeNull();
  });
  it('every link uses a filter the target page actually accepts', () => {
    for (const [tile, href] of Object.entries(DASHBOARD_LINKS)) {
      if (!href) continue;
      const q = query(href);
      if (href.startsWith('/review')) expect(filterSchema.parse(q.filter), tile).toBe(q.filter);
      else if (href.startsWith('/content')) expect(contentFiltersSchema.parse(q).type, tile).toBe(q.type);
      else if (href.startsWith('/users')) expect(userFiltersSchema.parse(q).status, tile).toBe(q.status);
      else expect(href, tile).toBe('/reports');
    }
  });
});
