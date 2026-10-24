// Reason codes moderators pick (PRD: doxxing, bullying, spam, prohibited item, other).
const REASONS: Record<string, string> = {
  doxxing: "It shared someone's personal details.",
  bullying: 'It was bullying or harassment.',
  spam: 'It was spam.',
  prohibited_item: 'It offered a prohibited item.',
  inappropriate: 'It was inappropriate for the community.',
  other: 'It broke the community rules.',
};

/** The plain-words reason for a known code only (notifications show nothing otherwise). */
export function knownReason(code: string | null): string | null {
  return code ? (REASONS[code] ?? null) : null;
}

/** Plain-words reason for a rejected or removed item. Unknown codes are shown as typed. */
export function describeReason(code: string | null): string {
  if (!code) return 'It broke the community rules.';
  return REASONS[code] ?? code;
}
