import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
type Scrollable = { scrollToOffset: (params: { offset: number; animated?: boolean }) => void };

// Shown once the list is scrolled more than one viewport (at least this much) down.
const MIN_THRESHOLD_PX = 600;
// Beyond this many viewports, jump most of the way first and animate only the last stretch.
const LONG_SCROLL_VIEWPORTS = 4;
const LANDING_VIEWPORTS = 1.5;

/**
 * State for the floating "back to top" button of one list. The offset lives in a ref;
 * React state changes only when the button should appear or disappear, so scrolling
 * never re-renders the screen or its rows. `onScroll` also calls the list's own handler.
 */
export function useBackToTop(listRef: RefObject<Scrollable | null>, onScrollExtra?: (e: ScrollEvent) => void) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const offsetRef = useRef(0);
  const viewportRef = useRef(0);
  const extraRef = useRef(onScrollExtra);
  useEffect(() => {
    extraRef.current = onScrollExtra;
  }, [onScrollExtra]);

  const onScroll = useCallback((e: ScrollEvent) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    offsetRef.current = contentOffset.y;
    viewportRef.current = layoutMeasurement.height;
    const show = contentOffset.y > Math.max(layoutMeasurement.height, MIN_THRESHOLD_PX);
    if (show !== visibleRef.current) {
      visibleRef.current = show;
      setVisible(show);
    }
    extraRef.current?.(e);
  }, []);

  const scrollToTop = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    if (reduceMotion) {
      list.scrollToOffset({ offset: 0, animated: false });
      return;
    }
    const viewport = Math.max(viewportRef.current, MIN_THRESHOLD_PX);
    if (offsetRef.current > viewport * LONG_SCROLL_VIEWPORTS) {
      // A very long animated scroll is slow and renders every row on the way; land close, then glide.
      list.scrollToOffset({ offset: viewport * LANDING_VIEWPORTS, animated: false });
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      return;
    }
    list.scrollToOffset({ offset: 0, animated: true });
  }, [listRef, reduceMotion]);

  return { onScroll, scrollEventThrottle: 16, visible, scrollToTop };
}
