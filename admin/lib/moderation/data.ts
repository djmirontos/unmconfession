import 'server-only';

import { codeFromError } from '@/lib/errors';
import { formatAgo, formatExact } from '@/lib/format';
import { moderationActionLabel, reportReasonLabel } from '@/lib/moderation/labels';
import type { KeysetCursor } from '@/lib/moderation/schemas';
import { imageCount } from '@/lib/review/content';
import { keyOf, pickNextAfterAction, preview, type QueueEntry } from '@/lib/review/queue';
import type { ContentType } from '@/lib/review/schemas';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type Fn = Database['public']['Functions'];
type Enums = Database['public']['Enums'];

export const PAGE = 30;
const WINDOW = 100;

export type Page<Row> = { rows: Row[]; nextCursor: KeysetCursor | null };

function fail(error: unknown): never {
  throw new Error(codeFromError(error));
}

function page<R, Row>(data: R[], toRow: (r: R) => Row, cursorOf: (r: R) => KeysetCursor, limit: number): Page<Row> {
  return { rows: data.map(toRow), nextCursor: data.length === limit ? cursorOf(data[data.length - 1]) : null };
}

const after = (cursor?: KeysetCursor) => (cursor ? { p_after_ts: cursor.ts, p_after_id: cursor.id } : {});

// ---------------------------------------------------------------- reports

export type ReportRow = {
  key: string;
  type: ContentType;
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

export async function fetchReportDetails(type: ContentType, id: string): Promise<ReportDetail[]> {
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
export async function openReportIds(type: ContentType, id: string): Promise<string[] | null> {
  try {
    return (await fetchReportDetails(type, id)).filter((r) => r.status === 'open').map((r) => r.id);
  } catch {
    return null;
  }
}

const reportEntry = (r: ReportRpc): QueueEntry => ({ target_type: r.target_type, target_id: r.target_id, created_at: r.first_reported_at });

/** Next reported item after the current one (same rules as the review queue, ordered by first report). */
export async function fetchNextReport(current: { type: ContentType; id: string }, cursor: KeysetCursor | undefined, filter?: ContentType) {
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

export type ContentFilters = { type?: ContentType; status?: Enums['content_status']; q?: string };

export async function fetchContentPage(filters: ContentFilters, cursor?: KeysetCursor): Promise<Page<ContentListRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_list_content', {
    p_limit: PAGE,
    ...(filters.type ? { p_type: filters.type } : {}),
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.q ? { p_search: filters.q } : {}),
    ...after(cursor),
  });
  if (error) fail(error);
  return page(
    data ?? [],
    (r) => ({
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
    }),
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
