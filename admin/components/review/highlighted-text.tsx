import { splitHighlight } from '@/lib/review/highlight';

/** The body as plain text with line breaks kept; the held keyword is marked. Never rendered as HTML. */
export function HighlightedText({ text, term }: { text: string; term: string | null }) {
  const segments = splitHighlight(text, term);
  return (
    <p className="whitespace-pre-wrap break-words text-base leading-7">
      {segments.map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-sm bg-gold/35 px-0.5 font-semibold text-foreground ring-1 ring-gold">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}
