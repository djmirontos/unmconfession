import { useEffect, useState } from 'react';
import { type DimensionValue, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';

type Props = {
  width?: DimensionValue;
  height?: DimensionValue;
  className?: string;
};

const BAND_WIDTH = 80;

/** Placeholder block with a moving highlight band. Static when the OS asks for reduced motion. */
export function Skeleton({ width = '100%', height = 14, className = 'rounded-md' }: Props) {
  const { scheme } = useTheme();
  const band = scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
  const reduceMotion = useReducedMotion();
  const [boxWidth, setBoxWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || boxWidth === 0) return;
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1);
  }, [reduceMotion, boxWidth, progress]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -BAND_WIDTH + progress.value * (boxWidth + BAND_WIDTH * 2) },
      { skewX: '-20deg' },
    ],
  }));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
      style={{ width, height }}
      className={`overflow-hidden bg-surface2 ${className}`}
    >
      {reduceMotion ? null : (
        <Animated.View style={[{ width: BAND_WIDTH, height: '100%', backgroundColor: band }, bandStyle]} />
      )}
    </View>
  );
}
