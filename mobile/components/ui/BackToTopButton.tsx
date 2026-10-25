import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';

type Props = {
  visible: boolean;
  onPress: () => void;
  /** Distance from the bottom of the list container (add the safe area on screens without a tab bar). */
  bottom?: number;
};

const DURATION_MS = 150;

/**
 * 44 px round "back to top" button over the bottom-right of a list. Always mounted and
 * faded / scaled in place, so showing it never re-renders the list; while hidden it
 * takes no touches and is hidden from screen readers.
 */
export function BackToTopButton({ visible, onPress, bottom = 16 }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: reduceMotion ? 0 : DURATION_MS });
  }, [visible, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.85 + 0.15 * progress.value }],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', right: 16, bottom }, style]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Back to top"
        className="h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface1 shadow-md active:opacity-80"
      >
        <Ionicons name="arrow-up" size={22} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
}
