import { z } from 'zod';

import { isActivelySuspended, type TargetUser, type Viewer } from '@/lib/moderation/availability';

// Warnings, mutes and strikes (20261106120000_warnings_strikes.sql). The database decides again:
// mod_warn_user / mod_mute_user check staff rights, the reason list, the note and the duration.

/** The fixed reason list (_warning_reason_ok). The member sees the label, never who sent it. */
export const WARNING_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam_scam', label: 'Spam or scam' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'threats', label: 'Threats' },
  { value: 'filter_evasion', label: 'Filter evasion' },
  { value: 'other', label: 'Other' },
] as const;
export type WarningReason = (typeof WARNING_REASONS)[number]['value'];
export const WARNING_REASON_VALUES = WARNING_REASONS.map((r) => r.value) as [WarningReason, ...WarningReason[]];

export function warningReasonLabel(code: string): string {
  return WARNING_REASONS.find((r) => r.value === code)?.label ?? code;
}

export const WARNING_NOTE_MAX = 300;

/** Mute lengths offered (mod_mute_user accepts 1 to 720 hours). */
export const MUTE_PRESETS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
] as const;
export type MuteHours = (typeof MUTE_PRESETS)[number]['hours'];

const note = z.string().trim().max(WARNING_NOTE_MAX).optional();

export const warnSchema = z.object({ user: z.uuid(), reason: z.enum(WARNING_REASON_VALUES), note });
export const muteSchema = z.object({
  user: z.uuid(),
  hours: z.number().int().min(1).max(720),
  reason: z.enum(WARNING_REASON_VALUES),
  note,
});

/** A failed parse as one of our codes (the field that failed decides the wording). */
export function warningInputError(issues: readonly { path: readonly PropertyKey[] }[]): string {
  const field = issues[0]?.path[0];
  if (field === 'reason') return 'invalid_reason';
  if (field === 'note') return 'note_too_long';
  if (field === 'hours') return 'invalid_duration';
  return 'invalid_input';
}

export type DisciplineActions = {
  warn: boolean;
  mute: boolean;
  /** Mute would be allowed but the member is already banned or suspended (restore first). */
  muteBlocked: boolean;
};

/**
 * Mirrors mod_warn_user / mod_mute_user: never yourself, never an admin, moderators only on
 * regular members, never a deleted account; a mute only when not already restricted.
 */
export function disciplineActions(viewer: Viewer, target: TargetUser, now = Date.now()): DisciplineActions {
  const allowed = !target.deleted && viewer.id !== target.id && target.role !== 'admin' && (target.role === 'user' || viewer.isAdmin);
  const restricted = target.status === 'banned' || isActivelySuspended(target.status, target.suspendedUntil, now);
  return { warn: allowed, mute: allowed && !restricted, muteBlocked: allowed && restricted };
}

/** The reason column of the moderation log: warning codes as labels, anything else as stored. */
export function logReasonLabel(action: string, code: string | null): string | null {
  if (code === null) return null;
  return action === 'warn' || action === 'suspend' ? warningReasonLabel(code) : code;
}

export type Strikes = {
  keywordHits30: number;
  keywordHits90: number;
  warnings30: number;
  warnings90: number;
  mutes30: number;
  mutes90: number;
  lastStrikeAt: string | null;
};

export const hasStrikes = (s: Strikes) => s.keywordHits90 + s.warnings90 + s.mutes90 > 0 || s.lastStrikeAt !== null;
