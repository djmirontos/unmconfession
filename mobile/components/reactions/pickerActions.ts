import { AccessibilityInfo } from 'react-native';

import { resetPickerShared, selectedIndex } from '@/components/reactions/pickerShared';
import { REACTION_TYPES } from '@/lib/reactions';
import { useReactionPickerStore } from '@/stores/reactionPickerStore';

// Long enough for the chosen emoji's pop to read before the card fades out.
const SELECT_HOLD_MS = 120;

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion = v));
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduceMotion = v));

// Matches the card's fade-out, so the emoji do not snap back while it fades.
const FADE_OUT_MS = 110;

export function closePicker(): void {
  useReactionPickerStore.getState().close();
  // Reset after the fade, unless it was reopened meanwhile (opening resets on its own).
  setTimeout(() => {
    if (useReactionPickerStore.getState().anchor === null) resetPickerShared();
  }, FADE_OUT_MS);
}

/** Picks the emoji at `index`: the reaction applies at once (optimistic), the emoji pops, then the picker closes. */
export function selectFromPicker(index: number): void {
  const { onPick } = useReactionPickerStore.getState();
  const type = REACTION_TYPES[index];
  if (!onPick || !type) return closePicker();
  selectedIndex.value = index;
  onPick(type);
  if (reduceMotion) closePicker();
  else setTimeout(closePicker, SELECT_HOLD_MS);
}
