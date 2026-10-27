import { z } from 'zod';

import { afterArgs } from '@/lib/moderation/keyset';
import { type KeysetCursor, keysetCursorSchema } from '@/lib/moderation/schemas';

// The moderation log (/log) and the audit log (/audit). Pure: the loaders and the tests share it.

export const LOG_PAGE = 30;

/** moderation_actions.target_type check constraint. */
export const LOG_TARGET_TYPES = ['post', 'comment', 'listing', 'user'] as const;
export type LogTargetType = (typeof LOG_TARGET_TYPES)[number];
export const LOG_TARGET_LABELS: Record<LogTargetType, string> = { post: 'Post', comment: 'Comment', listing: 'Listing', user: 'Account' };

export const targetTypeLabel = (type: string) => LOG_TARGET_LABELS[type as LogTargetType] ?? type;

/** URL filters for /log: ids only (no nicknames or emails in the URL); bad values fall back to "all". */
export const logFiltersSchema = z.object({
  target: z.enum(LOG_TARGET_TYPES).optional().catch(undefined),
  actor: z.uuid().optional().catch(undefined),
  subject: z.uuid().optional().catch(undefined),
});
export type LogFilters = z.infer<typeof logFiltersSchema>;

/** The parsed filters as "Load more" sends them back (strict: anything else is refused). */
export const logLoadSchema = z.object({
  filters: z.object({
    target: z.enum(LOG_TARGET_TYPES).optional(),
    actor: z.uuid().optional(),
    subject: z.uuid().optional(),
  }),
  cursor: keysetCursorSchema,
});
export const auditLoadSchema = z.object({ cursor: keysetCursorSchema });

/** Filters shown in the Filters sheet (the subject is a chip and stays when the sheet is cleared). */
export const LOG_SHEET_FILTERS = ['target', 'actor'] as const;

export function activeLogFilterCount(filters: LogFilters): number {
  return LOG_SHEET_FILTERS.filter((name) => filters[name] !== undefined).length;
}

/** mod_get_actions arguments: only the filters that are set, then the cursor. */
export function logActionArgs(filters: LogFilters, cursor?: KeysetCursor, limit = LOG_PAGE) {
  return {
    p_limit: limit,
    ...(filters.target ? { p_target_type: filters.target } : {}),
    ...(filters.actor ? { p_actor: filters.actor } : {}),
    ...(filters.subject ? { p_subject_user: filters.subject } : {}),
    ...afterArgs(cursor),
  };
}

/** admin_get_audit arguments. */
export function auditArgs(cursor?: KeysetCursor, limit = LOG_PAGE) {
  return { p_limit: limit, ...afterArgs(cursor) };
}

/** The panel page for a logged target, or null when there is none (unknown type, missing id). */
export function targetHref(type: string | null, id: string | null): string | null {
  if (!type || !id || !z.uuid().safeParse(id).success) return null;
  if (type === 'post' || type === 'comment' || type === 'listing') return `/content/${type}/${id}`;
  if (type === 'user') return `/users/${id}`;
  return null;
}

/** The user page for an id, or null (the account no longer has a profile). */
export const userHref = (id: string | null) => (id && z.uuid().safeParse(id).success ? `/users/${id}` : null);

/** The /log query with one filter removed (a chip's remove link). */
export function logHrefWithout(filters: LogFilters, name: keyof LogFilters): string {
  const params = new URLSearchParams();
  for (const key of ['target', 'actor', 'subject'] as const) {
    const value = filters[key];
    if (key !== name && value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/log?${query}` : '/log';
}

// ---------------------------------------------------------------- audit

/**
 * admin_audit_log.action check constraint, plus "view_content_author", which admin_get_audit
 * adds from identity_audit_log (the content-author lookup). Unknown values are shown as they are.
 */
const AUDIT_LABELS: Record<string, string> = {
  view_identity: 'Viewed identity',
  find_by_email: 'Looked up by email',
  set_role: 'Changed role',
  delete_account: 'Deleted account',
  view_content_author: 'Viewed a content author',
};

export function auditActionLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

/**
 * The stored detail as shown: the role change ("user -> moderator"), the deletion reason, or
 * "no match" for an email lookup. The searched address is never stored, so none can be shown.
 */
export function auditDetail(action: string, detail: string | null): string | null {
  if (!detail) return null;
  if (action === 'set_role') return `Role: ${detail.replace(' -> ', ' → ')}`;
  if (action === 'delete_account') return `Reason: ${detail}`;
  if (action === 'find_by_email' && detail === 'no match') return 'No account matched';
  return detail;
}
