import 'server-only';

import { requireAdmin, requireStaff } from '@/lib/auth';
import { serverEnv } from '@/lib/env';
import { codeFromError } from '@/lib/errors';
import { formatAgo, formatExact } from '@/lib/format';
import { avatarUrl } from '@/lib/moderation/avatar';
import { type ContentFilters, contentListArgs } from '@/lib/moderation/content-args';
import { afterArgs, keysetPage, type Page } from '@/lib/moderation/keyset';
import { moderationActionLabel, reportReasonLabel } from '@/lib/moderation/labels';
import { auditActionLabel, auditArgs, auditDetail, LOG_PAGE, type LogFilters, logActionArgs, targetHref, targetTypeLabel, userHref } from '@/lib/moderation/log';
import type { KeysetCursor } from '@/lib/moderation/schemas';
import { imageCount } from '@/lib/review/content';
import { keyOf, pickNextAfterAction, preview, type QueueEntry } from '@/lib/review/queue';
import { type ContentType, isContentType, type ReportTargetType } from '@/lib/review/schemas';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type { Page };

type Fn = Database['public']['Functions'];
type Enums = Database['public']['Enums'];

export const PAGE = 30;
const WINDOW = 100;

function fail(error: unknown): never {
  throw new Error(codeFromError(error));
}

const page = keysetPage;
const after = afterArgs;

// ---------------------------------------------------------------- reports

export type ReportRow = {
  key: string;
  type: ReportTargetType;
  id: string;
  count: number;
  reasons: string[];
  firstAgo: string;
  firstExact: string;
  firstAt: string;
  lastAgo: string;
  lastExact: string;
  status: Enums['content_status'] | null;
  nickname: string | null;
  kind: string | null;
  preview: string;
  images: number;
  /** Profile reports: the reported picture (null for a preset). */
  avatarUrl: string | null;
};

type ReportRpc = Fn['mod_get_reports']['Returns'][number];

function toReportRow(r: ReportRpc): ReportRow {
  return {
    key: keyOf(r),
    type: r.target_type,
    id: r.target_id,
    count: r.report_count,
    reasons: (r.reasons ?? []).map(reportReasonLabel),
    firstAt: r.first_reported_at,
    firstAgo: formatAgo(r.first_reported_at),
    firstExact: formatExact(r.first_reported_at),
    lastAgo: formatAgo(r.last_reported_at),
    lastExact: formatExact(r.last_reported_at),
    status: r.content_status,
    nickname: r.nickname,
    kind: r.title,
    preview: preview(r.body),
    images: imageCount(r.images),
    avatarUrl: r.target_type === 'profile' ? avatarUrl(r.target_id, r.avatar_key, serverEnv().url) : null,
  };
}

async function reportsRpc(limit: number, cursor?: KeysetCursor): Promise<ReportRpc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_reports', { p_limit: limit, ...after(cursor) });
  if (error) fail(error);
  return data ?? [];
}

export async function fetchReportsPage(cursor?: KeysetCursor): Promise<Page<ReportRow>> {
  return page(await reportsRpc(PAGE, cursor), toReportRow, (r) => ({ ts: r.first_reported_at, id: r.target_id }), PAGE);
}

export type ReportDetail = {
  id: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  exact: string;
  ago: string;
  reporter: string | null;
  handledBy: string | null;
  handledExact: string | null;
};

export async function fetchReportDetails(type: ReportTargetType, id: string): Promise<ReportDetail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_report_details', { p_type: type, p_id: id });
  if (error) fail(error);
  return (data ?? []).map((r) => ({
    id: r.report_id,
    reason: reportReasonLabel(r.reason),
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
    exact: formatExact(r.created_at),
    ago: formatAgo(r.created_at),
    reporter: r.reporter_nickname,
    handledBy: r.handled_by_nickname,
    handledExact: r.handled_at ? formatExact(r.handled_at) : null,
  }));
}

/** Ids of the reports still open on the item, or null if they could not be read. */
export async function openReportIds(type: ReportTargetType, id: string): Promise<string[] | null> {
  try {
    return (await fetchReportDetails(type, id)).filter((r) => r.status === 'open').map((r) => r.id);
  } catch {
    return null;
  }
}

const reportEntry = (r: ReportRpc): QueueEntry => ({ target_type: r.target_type, target_id: r.target_id, created_at: r.first_reported_at });

/** Next reported item after the current one (same rules as the review queue, ordered by first report). */
export async function fetchNextReport(current: { type: ReportTargetType; id: string }, cursor: KeysetCursor | undefined, filter?: ReportTargetType) {
  const [afterRows, head] = await Promise.all([cursor ? reportsRpc(WINDOW, cursor) : Promise.resolve([]), reportsRpc(WINDOW)]);
  return pickNextAfterAction(afterRows.map(reportEntry), head.map(reportEntry), keyOf({ target_type: current.type, target_id: current.id }), filter);
}

// ---------------------------------------------------------------- content

export type ContentListRow = {
  key: string;
  type: ContentType;
  id: string;
  status: Enums['content_status'];
  kind: string | null;
  preview: string;
  nickname: string | null;
  ago: string;
  exact: string;
  createdAt: string;
  deletedByAuthor: boolean;
  postNumber: number | null;
  images: number;
};

export type { ContentFilters };

export async function fetchContentPage(filters: ContentFilters, cursor?: KeysetCursor): Promise<Page<ContentListRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_list_content', contentListArgs(filters, PAGE, cursor));
  if (error) fail(error);
  // mod_list_content lists posts, comments and listings only; the guard narrows the type.
  return page(
    data ?? [],
    (r) => {
      if (!isContentType(r.target_type)) return null;
      return {
        key: keyOf(r),
        type: r.target_type,
        id: r.target_id,
        status: r.status,
        kind: r.title,
        preview: preview(r.body),
        nickname: r.nickname,
        ago: formatAgo(r.created_at),
        exact: formatExact(r.created_at),
        createdAt: r.created_at,
        deletedByAuthor: r.deleted_at !== null,
        postNumber: r.post_number,
        images: imageCount(r.images),
      };
    },
    (r) => ({ ts: r.created_at, id: r.target_id }),
    PAGE,
  );
}

// ---------------------------------------------------------------- users

type UserRpc = Fn['mod_search_users']['Returns'][number];

export type UserRow = {
  id: string;
  nickname: string | null;
  role: Enums['app_role'];
  status: Enums['account_status'];
  suspendedUntil: string | null;
  statusReason: string | null;
  deleted: boolean;
  avatarKey: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  joinedExact: string;
  termsAcceptedExact: string | null;
  posts: number;
  comments: number;
  listings: number;
  openReports: number;
};

function toUserRow(r: UserRpc): UserRow {
  return {
    id: r.user_id,
    nickname: r.nickname,
    role: r.role,
    status: r.status,
    suspendedUntil: r.suspended_until,
    statusReason: r.status_reason,
    deleted: r.deleted,
    avatarKey: r.avatar_key,
    avatarUrl: avatarUrl(r.user_id, r.avatar_key, serverEnv().url),
    joinedAt: r.joined_at,
    joinedExact: formatExact(r.joined_at),
    termsAcceptedExact: r.terms_accepted_at ? formatExact(r.terms_accepted_at) : null,
    posts: r.post_count,
    comments: r.comment_count,
    listings: r.listing_count,
    openReports: r.open_reports_against,
  };
}

export type UserFilters = { q?: string; status?: Enums['account_status']; role?: Enums['app_role']; deleted: boolean };

export async function fetchUsersPage(filters: UserFilters, cursor?: KeysetCursor): Promise<Page<UserRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_search_users', {
    p_limit: PAGE,
    p_include_deleted: filters.deleted,
    ...(filters.q ? { p_search: filters.q } : {}),
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.role ? { p_role: filters.role } : {}),
    ...after(cursor),
  });
  if (error) fail(error);
  return page(data ?? [], toUserRow, (r) => ({ ts: r.joined_at, id: r.user_id }), PAGE);
}

/** One account by id (deleted ones included), or null. */
export async function fetchUser(id: string): Promise<UserRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_search_users', { p_user: id, p_limit: 1 });
  if (error) fail(error);
  return data?.[0] ? toUserRow(data[0]) : null;
}

// ---------------------------------------------------------------- moderation history

export type HistoryRow = {
  id: string;
  ago: string;
  exact: string;
  actor: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  note: string | null;
  originalBody: string | null;
};

export type HistoryQuery = { kind: 'target'; type: ContentType; id: string } | { kind: 'user'; user: string };

export async function fetchHistory(query: HistoryQuery, cursor?: KeysetCursor): Promise<Page<HistoryRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_actions', {
    p_limit: PAGE,
    ...(query.kind === 'target' ? { p_target_type: query.type, p_target_id: query.id } : { p_subject_user: query.user }),
    ...after(cursor),
  });
  if (error) fail(error);
  return page(
    data ?? [],
    (r) => ({
      id: r.id,
      ago: formatAgo(r.created_at),
      exact: formatExact(r.created_at),
      actor: r.actor_nickname,
      action: moderationActionLabel(r.action),
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason_code,
      note: r.note,
      originalBody: r.original_body,
    }),
    (r) => ({ ts: r.created_at, id: r.id }),
    PAGE,
  );
}

// ---------------------------------------------------------------- moderation log (/log)

export type LogRow = {
  id: string;
  ago: string;
  exact: string;
  createdAt: string;
  actor: string | null;
  actorHref: string | null;
  action: string;
  targetLabel: string;
  targetHref: string | null;
  reason: string | null;
  note: string | null;
  originalBody: string | null;
};

/** Every moderation action, newest first. Checks the staff role itself (and the RPC again). */
export async function fetchLog(filters: LogFilters, cursor?: KeysetCursor): Promise<Page<LogRow>> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_actions', logActionArgs(filters, cursor));
  if (error) fail(error);
  return page(
    data ?? [],
    (r) => ({
      id: r.id,
      ago: formatAgo(r.created_at),
      exact: formatExact(r.created_at),
      createdAt: r.created_at,
      actor: r.actor_nickname,
      actorHref: userHref(r.actor_id),
      action: moderationActionLabel(r.action),
      targetLabel: targetTypeLabel(r.target_type),
      targetHref: targetHref(r.target_type, r.target_id),
      reason: r.reason_code,
      note: r.note,
      originalBody: r.original_body,
    }),
    (r) => ({ ts: r.created_at, id: r.id }),
    LOG_PAGE,
  );
}

// ---------------------------------------------------------------- audit log (/audit)

export type AuditRow = {
  id: string;
  ago: string;
  exact: string;
  createdAt: string;
  admin: string | null;
  adminHref: string | null;
  action: string;
  /** The account the entry is about; null when there is none (an email lookup with no match). */
  subjectId: string | null;
  subject: string | null;
  subjectHref: string | null;
  targetLabel: string | null;
  targetHref: string | null;
  detail: string | null;
};

/** Admin-only actions and identity lookups, newest first. Admins only (checked here and in the RPC). */
export async function fetchAudit(cursor?: KeysetCursor): Promise<Page<AuditRow>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_get_audit', auditArgs(cursor));
  if (error) fail(error);
  return page(
    data ?? [],
    (r) => ({
      id: r.id,
      ago: formatAgo(r.created_at),
      exact: formatExact(r.created_at),
      createdAt: r.created_at,
      admin: r.admin_nickname,
      adminHref: userHref(r.admin_id),
      action: auditActionLabel(r.action),
      subjectId: r.subject_user_id,
      subject: r.subject_nickname,
      subjectHref: userHref(r.subject_user_id),
      targetLabel: r.target_type ? targetTypeLabel(r.target_type) : null,
      targetHref: targetHref(r.target_type, r.target_id),
      detail: auditDetail(r.action, r.detail),
    }),
    (r) => ({ ts: r.created_at, id: r.id }),
    LOG_PAGE,
  );
}

/** Moderators and admins for the actor filter (up to 30 of each, newest first). */
export async function fetchStaffOptions(): Promise<{ id: string; nickname: string }[]> {
  const [mods, admins] = await Promise.all([
    fetchUsersPage({ role: 'moderator', deleted: false }),
    fetchUsersPage({ role: 'admin', deleted: false }),
  ]);
  return [...admins.rows, ...mods.rows]
    .flatMap((u) => (u.nickname ? [{ id: u.id, nickname: u.nickname }] : []))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}
