import { makeMutable } from 'react-native-reanimated';

import type { Rect } from '@/components/reactions/pickerLayout';

// UI-thread state for the open picker. The gesture worklet writes it while the
// finger moves and only the overlay's animated styles read it, so nothing in
// React (and no list) re-renders per frame.
export const hoverIndex = makeMutable(-1);
/** Set once the finger has been over any emoji during this hold. */
export const everHovered = makeMutable(false);
/** The emoji that was just picked (plays the "chosen" pop). */
export const selectedIndex = makeMutable(-1);
/** Picker card in window coordinates; width 0 = not laid out yet. */
export const cardRect = makeMutable<Rect>({ x: 0, y: 0, width: 0, height: 0 });

export function resetPickerShared(): void {
  hoverIndex.value = -1;
  everHovered.value = false;
  selectedIndex.value = -1;
  cardRect.value = { x: 0, y: 0, width: 0, height: 0 };
}

/** Worklet setters, so gesture callbacks never assign module values directly. */
export function trackHover(index: number): void {
  'worklet';
  if (index !== hoverIndex.value) hoverIndex.value = index;
  if (index >= 0) everHovered.value = true;
}

export function setCardRect(rect: Rect): void {
  cardRect.value = rect;
}
