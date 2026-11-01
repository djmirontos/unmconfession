// Mirrors the reports.reason check constraint; the server re-validates. Kept free of imports so
// pure modules (lib/moderation.ts) and the Node tests can use the labels.
export const REPORT_REASONS = [
  { value: 'doxxing', label: 'Doxxing / personal info' },
  { value: 'bullying', label: 'Bullying or harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'prohibited_item', label: 'Prohibited item' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
