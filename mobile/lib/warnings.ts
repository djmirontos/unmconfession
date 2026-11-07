// Notices from the moderators: warnings and mutes (20261106120000_warnings_strikes.sql). Pure, no
// imports (tests/warnings.test.mjs).
//
// Rule: a notice never names the staff member. The member sees only the reason and the optional
// note. A mute is the existing timed suspension (read-only); its end time also feeds the usual
// "suspended" message (lib/errors.ts), which is otherwise unchanged.

export const WARNING_REASON_LABELS: Readonly<Record<string, string>> = {
  harassment: 'Harassment',
  spam_scam: 'Spam or scam',
  sexual_content: 'Sexual content',
  threats: 'Threats',
  filter_evasion: 'Filter evasion',
  other: 'Other',
};

/** A known reason's label; anything else reads as a plain rule break (a code is never shown raw). */
export const warningReasonLabel = (code: string | null | undefined): string =>
  (code ? WARNING_REASON_LABELS[code] : undefined) ?? 'Breaking the community rules';

export const WARNING_ROW_TITLE = 'Notice from the moderators';

export type WarningKind = 'warning' | 'mute';
export type MyWarning = { kind: WarningKind; reason: string | null; note: string | null; untilAt: string | null; createdAt: string };

export const isWarningKind = (v: unknown): v is WarningKind => v === 'warning' || v === 'mute';

export const warningTitle = (kind: WarningKind): string => (kind === 'mute' ? 'You were muted' : 'Warning');

/** Local date and time, e.g. "Nov 7, 3:00 PM". */
export function formatLocalDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A mute in force: an end time later than now. A missing or unreadable time is not in force. */
export function muteInForce(untilAt: string | null, now: number): boolean {
  if (!untilAt) return false;
  const t = Date.parse(untilAt);
  return !Number.isNaN(t) && t > now;
}

/** The mute line in the notice. */
export function muteLine(untilAt: string | null, now: number, format: (iso: string) => string = formatLocalDateTime): string {
  if (!untilAt || !muteInForce(untilAt, now)) return 'This restriction has ended.';
  return `You can read but not post until ${format(untilAt)}.`;
}

// ---------------------------------------------------------------- the "suspended" message

let knownUntil: string | null = null;

/** The end of this member's own suspension or mute, when the app has seen it (notice, own account row). */
export function noteSuspendedUntil(untilAt: string | null): void {
  knownUntil = untilAt;
}

export const knownSuspendedUntil = (): string | null => knownUntil;

/** The usual suspended text; with a known future end time it says until when. */
export function suspendedMessage(
  base: string,
  untilAt: string | null,
  now: number,
  format: (iso: string) => string = formatLocalDateTime,
): string {
  if (!untilAt || !muteInForce(untilAt, now)) return base;
  return `This account is suspended until ${format(untilAt)}. You can still read.`;
}

// A "suspended" error was shown: the app may read the member's own end time (useMyRestriction).
const seenListeners = new Set<() => void>();
export function onSuspendedSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => void seenListeners.delete(listener);
}
export function notifySuspendedSeen(): void {
  for (const l of seenListeners) l();
}
