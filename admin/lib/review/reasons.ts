// Reject reasons offered in the panel. The label is what mod_review stores in p_reason
// (it is shown to moderators in the log and sent to the author in the notification).

export const REJECT_REASONS = [
  { value: 'doxxing', label: 'Doxxing or personal info' },
  { value: 'bullying', label: 'Bullying or harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'prohibited_item', label: 'Prohibited item' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]['value'];

export const REJECT_REASON_VALUES = REJECT_REASONS.map((r) => r.value) as [RejectReason, ...RejectReason[]];

export function reasonLabel(value: RejectReason): string {
  const found = REJECT_REASONS.find((r) => r.value === value);
  if (!found) throw new Error('Unknown reject reason');
  return found.label;
}
