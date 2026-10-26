import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/stores/toastStore';

const VISIBLE_MS = 2000;
// A toast with an action stays longer, so there is time to tap it.
const ACTION_VISIBLE_MS = 4000;
// Clears the bottom tab bar.
const TAB_BAR_OFFSET = 72;

/** Short message near the bottom. Mounted once at the root; entering/exiting follow the OS reduced-motion setting. */
export function Toast() {
  const insets = useSafeAreaInsets();
  const { message, onPress, id, hide } = useToastStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, onPress ? ACTION_VISIBLE_MS : VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, onPress, id, hide]);

  if (!message) return null;
  const text = <Text className="text-sm font-bold text-text">{message}</Text>;
  return (
    <Animated.View
      key={id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOut.duration(150)}
      pointerEvents={onPress ? 'box-none' : 'none'}
      style={{ bottom: insets.bottom + TAB_BAR_OFFSET }}
      className="absolute self-center rounded-full border border-hairline bg-surface2"
      accessibilityLiveRegion="polite"
      accessibilityRole={onPress ? undefined : 'alert'}
    >
      {onPress ? (
        <Pressable
          onPress={() => {
            hide();
            onPress();
          }}
          accessibilityRole="button"
          className="px-5 py-2.5"
          hitSlop={8}
        >
          {text}
        </Pressable>
      ) : (
        <View className="px-5 py-2.5">{text}</View>
      )}
    </Animated.View>
  );
}
