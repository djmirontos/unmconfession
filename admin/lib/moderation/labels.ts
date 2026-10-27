import { REJECT_REASONS } from '@/lib/review/reasons';

// Report reasons use the same six codes as the reject list (reports.reason check constraint).
export function reportReasonLabel(code: string): string {
  return REJECT_REASONS.find((r) => r.value === code)?.label ?? code;
}

const ACTION_LABEL: Record<string, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  remove: 'Removed',
  restore: 'Restored',
  edit: 'Edited',
  suspend: 'Suspended',
  ban: 'Banned',
  restore_user: 'Account restored',
};

export function moderationActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export const ROLE_HELP: Record<'user' | 'moderator' | 'admin', string> = {
  user: 'Uses the app only. No access to this panel.',
  moderator: 'Reviews content, handles reports and suspends or bans regular users.',
  admin: 'Everything a moderator does, plus roles, nicknames, email lookups and account deletion.',
};
