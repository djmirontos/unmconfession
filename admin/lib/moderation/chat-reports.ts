import { z } from 'zod';

// Chat reports in the panel (20261107160000_chat_reports.sql). Pure, so tests can use it. The
// database decides again: every mod_* call checks staff, admin-only reports and the report's owner.

export const CHAT_REPORT_STATUSES = ['open', 'dismissed', 'actioned'] as const;
export type ChatReportStatus = (typeof CHAT_REPORT_STATUSES)[number];
export const CHAT_REPORT_STATUS_LABELS: Record<ChatReportStatus, string> = { open: 'Open', dismissed: 'Dismissed', actioned: 'Actioned' };

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or bullying',
  spam_scam: 'Spam or scam',
  sexual_content: 'Sexual content',
  threats: 'Threats or violence',
  child_safety: 'Child safety',
  other: 'Something else',
};
export const chatReportReasonLabel = (code: string): string => REASON_LABELS[code] ?? code;

export const CHAT_REPORT_OUTCOMES = [
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'warned', label: 'Warned' },
  { value: 'muted', label: 'Muted' },
  { value: 'banned', label: 'Banned' },
  { value: 'other', label: 'Other' },
] as const;
export type ChatReportOutcome = (typeof CHAT_REPORT_OUTCOMES)[number]['value'];
const OUTCOME_VALUES = CHAT_REPORT_OUTCOMES.map((o) => o.value) as [ChatReportOutcome, ...ChatReportOutcome[]];
export const outcomeLabel = (code: string | null): string | null => (code ? (CHAT_REPORT_OUTCOMES.find((o) => o.value === code)?.label ?? code) : null);

export const RESOLUTION_NOTE_MAX = 300;

// ---------------------------------------------------------------- input

export const chatReportStatusSchema = z.enum(CHAT_REPORT_STATUSES).catch('open');
export const chatReportIdSchema = z.uuid();
export const resolveChatReportSchema = z.object({
  report: z.uuid(),
  outcome: z.enum(OUTCOME_VALUES),
  note: z.string().trim().max(RESOLUTION_NOTE_MAX).optional(),
});

export function resolveInputError(issues: readonly { path: readonly PropertyKey[] }[]): string {
  const field = issues[0]?.path[0];
  if (field === 'outcome') return 'invalid_outcome';
  if (field === 'note') return 'note_too_long';
  return 'invalid_input';
}

/** After a warning or a mute from the report page: the outcome offered for "Mark as resolved". */
export const outcomeAfter = (action: 'warn' | 'mute'): ChatReportOutcome => (action === 'warn' ? 'warned' : 'muted');

// ---------------------------------------------------------------- who may see and act

export type Viewer = { isAdmin: boolean };

/**
 * A list row a moderator may not open: admin-only (the database also blanks its nicknames and
 * note for them). Shown as "Restricted - admins only" and not linked.
 */
export const isRestrictedFor = (viewer: Viewer, row: { adminOnly: boolean }): boolean => row.adminOnly && !viewer.isAdmin;

export type ReportState = { status: ChatReportStatus; adminOnly: boolean; held: boolean };

export type ChatReportActions = { resolve: boolean; escalate: boolean; release: boolean; discipline: boolean };

/** Mirrors mod_resolve_chat_report / mod_escalate_chat_report / admin_release_chat_report_hold. */
export function chatReportActions(viewer: Viewer, r: ReportState): ChatReportActions {
  const open = r.status === 'open';
  const allowed = !r.adminOnly || viewer.isAdmin;
  return {
    resolve: open && allowed,
    escalate: open && !r.adminOnly,
    release: viewer.isAdmin && r.held,
    discipline: open && allowed,
  };
}

// ---------------------------------------------------------------- the evidence

const snapshotSchema = z.array(
  z.object({
    id: z.string().nullable(),
    from: z.enum(['reporter', 'reported']),
    at: z.string(),
    body: z.string().nullable(),
    deleted: z.boolean(),
    reported: z.boolean(),
  }),
);

export type TranscriptLine = {
  key: string;
  from: 'reporter' | 'reported';
  /** "Reporter (nick)" / "Reported (nick)". */
  sender: string;
  /** Plain text, rendered as text only (never HTML); null for a deleted message. */
  body: string | null;
  deleted: boolean;
  /** The message this report is about. */
  highlighted: boolean;
  at: string;
};

const senderLabel = (role: 'Reporter' | 'Reported', nickname: string | null) => (nickname ? `${role} (${nickname})` : role);

/**
 * The snapshot (jsonb) as transcript lines, oldest first as stored. Anything malformed gives
 * null (the page says the evidence could not be read) instead of a partial transcript.
 */
export function buildTranscript(
  snapshot: unknown,
  names: { reporter: string | null; reported: string | null },
): TranscriptLine[] | null {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;
  return parsed.data.map((m, i) => ({
    key: m.id ?? `line-${i}`,
    from: m.from,
    sender: m.from === 'reporter' ? senderLabel('Reporter', names.reporter) : senderLabel('Reported', names.reported),
    body: m.deleted ? null : m.body,
    deleted: m.deleted,
    highlighted: m.reported,
    at: m.at,
  }));
}

/** The count badge: a failed count call hides it. */
export const chatReportBadge = (count: number | null): number => (count && count > 0 ? count : 0);
