import 'server-only';

import { codeFromError } from '@/lib/errors';
import { formatAgo, formatExact } from '@/lib/format';
import { type ChatReportStatus, chatReportReasonLabel, CHAT_REPORT_STATUSES, outcomeLabel } from '@/lib/moderation/chat-reports';
import { afterArgs, keysetPage, type Page } from '@/lib/moderation/keyset';
import type { KeysetCursor } from '@/lib/moderation/schemas';
import { requestNow } from '@/lib/request-time';
import { createClient } from '@/lib/supabase/server';

// Chat report loaders. The list never calls mod_get_chat_report: every call to it is written to
// the audit log, so only the detail page calls it, once per navigation.

export const CHAT_REPORT_PAGE = 30;

const asStatus = (s: string): ChatReportStatus => ((CHAT_REPORT_STATUSES as readonly string[]).includes(s) ? (s as ChatReportStatus) : 'open');

export type ChatReportRow = {
  id: string;
  reason: string;
  reasonCode: string;
  status: ChatReportStatus;
  ago: string;
  exact: string;
  /** null for a moderator on an admin-only report (or a deleted account). */
  reporterNickname: string | null;
  reportedNickname: string | null;
  adminOnly: boolean;
  held: boolean;
  outcome: string | null;
};

export async function fetchChatReportsPage(status: ChatReportStatus, cursor?: KeysetCursor): Promise<Page<ChatReportRow>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_chat_reports', { p_status: status, p_limit: CHAT_REPORT_PAGE, ...afterArgs(cursor) });
  if (error) throw new Error(codeFromError(error));
  const now = requestNow();
  return keysetPage(
    data ?? [],
    (r) => ({
      id: r.id,
      reason: chatReportReasonLabel(r.reason),
      reasonCode: r.reason,
      status: asStatus(r.status),
      ago: formatAgo(r.created_at, now),
      exact: formatExact(r.created_at),
      reporterNickname: r.reporter_nickname ?? null,
      reportedNickname: r.reported_nickname ?? null,
      adminOnly: r.admin_only,
      held: r.held,
      outcome: outcomeLabel(r.outcome ?? null),
    }),
    (r) => ({ ts: r.created_at, id: r.id }),
    CHAT_REPORT_PAGE,
  );
}

export type ChatReportDetail = {
  id: string;
  reason: string;
  reasonCode: string;
  status: ChatReportStatus;
  createdExact: string;
  note: string | null;
  reporterNickname: string | null;
  reportedNickname: string | null;
  reportedId: string | null;
  messageId: string | null;
  snapshot: unknown;
  adminOnly: boolean;
  held: boolean;
  outcome: string | null;
  resolutionNote: string | null;
  resolvedExact: string | null;
};

export type ChatReportResult = { kind: 'ok'; report: ChatReportDetail } | { kind: 'not_found' } | { kind: 'restricted' };

/**
 * The one mod_get_chat_report call of a detail page (audit-logged by the database). not_found
 * (also a report about the caller) and forbidden (a moderator on an admin-only report) are
 * answers, not errors; anything else throws to the panel's error page.
 */
export async function fetchChatReport(id: string): Promise<ChatReportResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_get_chat_report', { p_report: id });
  if (error) {
    const code = codeFromError(error);
    if (code === 'not_found') return { kind: 'not_found' };
    if (code === 'forbidden') return { kind: 'restricted' };
    throw new Error(code);
  }
  const r = data?.[0];
  if (!r) return { kind: 'not_found' };
  return {
    kind: 'ok',
    report: {
      id: r.id,
      reason: chatReportReasonLabel(r.reason),
      reasonCode: r.reason,
      status: asStatus(r.status),
      createdExact: formatExact(r.created_at),
      note: r.note ?? null,
      reporterNickname: r.reporter_nickname ?? null,
      reportedNickname: r.reported_nickname ?? null,
      reportedId: r.reported_id ?? null,
      messageId: r.message_id ?? null,
      snapshot: r.snapshot,
      adminOnly: r.admin_only,
      held: r.held,
      outcome: r.outcome ?? null,
      resolutionNote: r.resolution_note ?? null,
      resolvedExact: r.resolved_at ? formatExact(r.resolved_at) : null,
    },
  };
}

/** Open chat reports not about me, for the sidebar badge; null when the call fails (no badge). */
export async function fetchOpenChatReportCount(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('mod_open_chat_report_count');
    return error ? null : data;
  } catch {
    return null;
  }
}
