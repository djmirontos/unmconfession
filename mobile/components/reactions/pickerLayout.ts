import { REACTION_TYPES } from '@/lib/reactions';

export type Anchor = { x: number; y: number; width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

const COUNT = REACTION_TYPES.length;
const ITEM = 44;
const GAP = 6;
const PAD = 8;
const MARGIN = 8;
// Extra room above/below the row that still counts as "over the picker" while dragging.
const SLOP_Y = 24;

/** Picker card and emoji rects in window coordinates: above the button, or below it if there is no room. */
export function pickerLayout(anchor: Anchor, screenWidth: number, topInset: number) {
  const width = COUNT * ITEM + (COUNT - 1) * GAP + PAD * 2;
  const height = ITEM + PAD * 2;
  const left = Math.min(Math.max(anchor.x, MARGIN), screenWidth - width - MARGIN);
  const above = anchor.y - height - MARGIN;
  const top = above >= topInset + MARGIN ? above : anchor.y + anchor.height + MARGIN;
  const items: Rect[] = REACTION_TYPES.map((_, i) => ({
    x: left + PAD + i * (ITEM + GAP),
    y: top + PAD,
    width: ITEM,
    height: ITEM,
  }));
  return { card: { x: left, y: top, width, height }, items, itemSize: ITEM };
}

/**
 * Index of the emoji under the finger, or -1. Runs on the UI thread during the
 * drag (worklet), so it only takes the card rect and plain numbers.
 * Horizontal gaps count toward the nearer emoji.
 */
export function hitTest(card: Rect, px: number, py: number): number {
  'worklet';
  if (card.width <= 0) return -1;
  if (py < card.y - SLOP_Y || py > card.y + card.height + SLOP_Y) return -1;
  if (px < card.x || px > card.x + card.width) return -1;
  const slot = (card.width - PAD * 2) / COUNT;
  const index = Math.floor((px - card.x - PAD) / slot);
  return Math.min(COUNT - 1, Math.max(0, index));
}
