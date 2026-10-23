// Reason codes moderators pick (PRD: doxxing, bullying, spam, prohibited item, other).
const REASONS: Record<string, string> = {
  doxxing: "It shared someone's personal details.",
  bullying: 'It was bullying or harassment.',
  spam: 'It was spam.',
  prohibited_item: 'It offered a prohibited item.',
  inappropriate: 'It was inappropriate for the community.',
  other: 'It broke the community rules.',
};

/** Plain-words reason for a rejected or removed item. Unknown codes are shown as typed. */
export function describeReason(code: string | null): string {
  if (!code) return 'It broke the community rules.';
  return REASONS[code] ?? code;
}
