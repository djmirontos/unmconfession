// WCAG 2.x contrast for opaque #RRGGBB colours. Pure, no imports (tests/chatColors.test.mjs).

/** Minimum ratios: normal text 4.5:1, icons and other graphics 3:1. */
export const MIN_TEXT = 4.5;
export const MIN_GRAPHIC = 3;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of "#RRGGBB" (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Contrast ratio between two colours, from 1 (same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type ColorPair = { name: string; fg: string; bg: string; kind: 'text' | 'graphic' };

export const meetsContrast = (p: ColorPair): boolean => contrastRatio(p.fg, p.bg) >= (p.kind === 'text' ? MIN_TEXT : MIN_GRAPHIC);
