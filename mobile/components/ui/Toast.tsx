import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/stores/toastStore';

const VISIBLE_MS = 2000;
// Clears the bottom tab bar.
const TAB_BAR_OFFSET = 72;

/** Short message near the bottom. Mounted once at the root; entering/exiting follow the OS reduced-motion setting. */
export function Toast() {
  const insets = useSafeAreaInsets();
  const { message, id, hide } = useToastStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, id, hide]);

  if (!message) return null;
  return (
    <Animated.View
      key={id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOut.duration(150)}
      pointerEvents="none"
      style={{ bottom: insets.bottom + TAB_BAR_OFFSET }}
      className="absolute self-center rounded-full border border-hairline bg-surface2 px-5 py-2.5"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text className="text-sm font-bold text-text">{message}</Text>
    </Animated.View>
  );
}
