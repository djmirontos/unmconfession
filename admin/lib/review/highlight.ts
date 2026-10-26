export type Segment = { text: string; match: boolean };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits text into plain and matching parts for the keyword that held the item
 * (case-insensitive, Unicode-aware). The caller renders the parts as React text, never HTML.
 * An empty or whitespace-only term returns the text as a single plain part.
 */
export function splitHighlight(text: string, term: string | null | undefined): Segment[] {
  const needle = term?.trim();
  if (!text) return [];
  if (!needle) return [{ text, match: false }];

  const pattern = new RegExp(escapeRegExp(needle), 'giu');
  const segments: Segment[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const start = found.index;
    if (start > last) segments.push({ text: text.slice(last, start), match: false });
    segments.push({ text: found[0], match: true });
    last = start + found[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments;
}
