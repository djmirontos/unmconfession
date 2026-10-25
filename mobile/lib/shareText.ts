// Pure helpers (no imports) so they can be tested with plain Node: `npm run test:share`.
// They keep share-card text inside its fixed 360 x 450 dp box.

export const SHARE_TEXT_MAX = 600;
// Blank lines collapse to one; past this many lines the rest joins into the last line.
const MAX_LINE_BREAKS = 10;
// Runs without spaces (URLs, "aaaaaaaa…") get invisible break points so they wrap instead of overflowing.
const LONG_RUN = 20;
const ZERO_WIDTH_SPACE = '​';

function breakLongRuns(text: string): string {
  return text.replace(new RegExp(`\\S{${LONG_RUN + 1},}`, 'gu'), (run) => {
    const chars = Array.from(run);
    const parts: string[] = [];
    for (let i = 0; i < chars.length; i += LONG_RUN) parts.push(chars.slice(i, i + LONG_RUN).join(''));
    return parts.join(ZERO_WIDTH_SPACE);
  });
}

function limitLineBreaks(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n');
  if (lines.length <= MAX_LINE_BREAKS + 1) return lines.join('\n');
  return [...lines.slice(0, MAX_LINE_BREAKS), lines.slice(MAX_LINE_BREAKS).join(' ')].join('\n');
}

/**
 * Card text: tidy line breaks, cut past `max` characters at a word boundary (counted in
 * code points, so emoji are never split), and make long unbroken runs wrappable.
 */
export function prepareShareText(raw: string, max = SHARE_TEXT_MAX): { text: string; truncated: boolean } {
  const tidy = limitLineBreaks(raw.trim());
  const chars = Array.from(tidy);
  if (chars.length <= max) return { text: breakLongRuns(tidy), truncated: false };
  const head = chars.slice(0, max).join('');
  const lastSpace = head.search(/\s\S*$/u);
  // Cut at the last space unless that would drop more than a fifth of the text.
  const cut = lastSpace > head.length * 0.8 ? head.slice(0, lastSpace) : head;
  return { text: `${breakLongRuns(cut.replace(/[\s.,;:!?-]+$/u, ''))}…`, truncated: true };
}

export type TextSize = { fontSize: number; lineHeight: number; maxLines: number };

// Body box of a confession / shoutout card: about 280 dp tall. maxLines = floor(280 / lineHeight),
// and each step holds at least its character limit at the card width.
const SMALLEST_BODY: TextSize = { fontSize: 14, lineHeight: 20, maxLines: 14 };
const BODY_SIZES: readonly (TextSize & { upTo: number })[] = [
  { upTo: 40, fontSize: 36, lineHeight: 44, maxLines: 6 },
  { upTo: 80, fontSize: 30, lineHeight: 38, maxLines: 7 },
  { upTo: 160, fontSize: 24, lineHeight: 32, maxLines: 8 },
  { upTo: 300, fontSize: 19, lineHeight: 27, maxLines: 10 },
  { upTo: 450, fontSize: 16, lineHeight: 23, maxLines: 12 },
];
// A line break uses about as much room as this many characters.
const LINE_BREAK_WEIGHT = 30;

/** Short text is large; long text steps down so it still fits. `reserveLines` leaves room below (e.g. "read more"). */
export function bodyTextSize(text: string, reserveLines = 0): TextSize {
  const breaks = (text.match(/\n/g) ?? []).length;
  const weight = Array.from(text).length + breaks * LINE_BREAK_WEIGHT;
  const size = BODY_SIZES.find((s) => weight <= s.upTo) ?? SMALLEST_BODY;
  return { fontSize: size.fontSize, lineHeight: size.lineHeight, maxLines: Math.max(1, size.maxLines - reserveLines) };
}

// Under a photo the text box holds 5 lines of 15 / 20 px. These limits keep a caption to about
// 4 lines, so "read more in the app" still fits as the 5th when it was cut.
export const PHOTO_CAPTION_LINES = 5;
const PHOTO_CAPTION_MAX = 160;
// A shoutout's "Shoutout to …" line takes room under the photo too.
const PHOTO_SHOUTOUT_CAPTION_MAX = 100;

/** Caption under a post photo: line breaks become spaces (a 5-line box), then cut short at a word. */
export function preparePhotoCaption(raw: string, shoutout = false): { text: string; truncated: boolean } {
  const flat = raw.replace(/\s+/g, ' ');
  return prepareShareText(flat, shoutout ? PHOTO_SHOUTOUT_CAPTION_MAX : PHOTO_CAPTION_MAX);
}

export const MAX_POLL_OPTIONS = 4;

export type PollLayout = { question: TextSize; shown: number; more: number; optionLines: 1 | 2 };

/**
 * Poll card: up to 4 options ("+N more" for the rest). Fewer options leave room for a longer
 * question and two-line options; with 4 the question keeps 3 lines and options 1 line, so the
 * card's worst case (long question, 4 long options, "+N more") still fits.
 */
export function pollLayout(question: string, optionCount: number): PollLayout {
  const shown = Math.min(optionCount, MAX_POLL_OPTIONS);
  const length = Array.from(question).length;
  const size: TextSize =
    length <= 60
      ? { fontSize: 24, lineHeight: 30, maxLines: 3 }
      : length <= 140
        ? { fontSize: 20, lineHeight: 26, maxLines: 4 }
        : { fontSize: 17, lineHeight: 22, maxLines: 4 };
  const maxLines = shown <= 2 ? size.maxLines : Math.min(size.maxLines, 3);
  return { question: { ...size, maxLines }, shown, more: optionCount - shown, optionLines: shown <= 3 ? 2 : 1 };
}
