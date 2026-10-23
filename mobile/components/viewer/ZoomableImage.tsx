import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ViewerImage } from '@/stores/imageViewerStore';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

type Props = {
  image: ViewerImage;
  width: number;
  height: number;
  /** Panning is enabled only while zoomed, so swipes go to the pager otherwise. */
  zoomed: boolean;
  onZoomChange: (zoomed: boolean) => void;
};

/** Pinch to zoom, drag while zoomed, double tap to toggle. Snaps back (instantly under reduced motion). */
export function ZoomableImage({ image, width, height, zoomed, onZoomChange }: Props) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 200;
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1, { duration });
    x.value = withTiming(0, { duration });
    y.value = withTiming(0, { duration });
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
    scheduleOnRN(onZoomChange, false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        reset();
        return;
      }
      savedScale.value = scale.value;
      scheduleOnRN(onZoomChange, true);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      // Keep the image edges within reach: allow moving by the zoomed overflow.
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      x.value = Math.min(maxX, Math.max(-maxX, savedX.value + e.translationX));
      y.value = Math.min(maxY, Math.max(-maxY, savedY.value + e.translationY));
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration });
        savedScale.value = DOUBLE_TAP_SCALE;
        scheduleOnRN(onZoomChange, true);
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[{ width, height }, style]}>
        <Image
          source={{ uri: image.uri }}
          placeholder={image.blurhash ? { blurhash: image.blurhash } : undefined}
          style={{ width, height }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </GestureDetector>
  );
}
