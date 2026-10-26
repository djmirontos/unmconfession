import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Some Android phones report 0 when the gesture hint is hidden; never sit flush on the edge.
const MIN_BOTTOM = 12;

/** Bottom safe-area space for anything pinned to the bottom edge; add the element's own padding on top. */
export function useBottomInset() {
  return Math.max(useSafeAreaInsets().bottom, MIN_BOTTOM);
}
