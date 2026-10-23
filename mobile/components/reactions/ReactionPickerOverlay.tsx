import { Image } from 'expo-image';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { closePicker, selectFromPicker } from '@/components/reactions/pickerActions';
import { pickerLayout } from '@/components/reactions/pickerLayout';
import { hoverIndex, selectedIndex } from '@/components/reactions/pickerShared';
import { useTheme } from '@/hooks/useTheme';
import { REACTION_TYPES, REACTIONS, type ReactionType } from '@/lib/reactions';
import { useReactionPickerStore } from '@/stores/reactionPickerStore';

const HOVER_SCALE = 1.6;
const OTHERS_SCALE = 0.9;
const CHOSEN_SCALE = 1.9;
const HOVER_RISE = -10;
const STAGGER_MS = 25;
const SPRING = { damping: 14, stiffness: 320, mass: 0.6 };
const IMAGE = 36;

/** Card entrance: quick fade + slight scale (~120 ms). */
function cardEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 120 }),
      transform: [{ scale: withTiming(1, { duration: 120 }) }],
    },
  };
}

type ItemProps = { type: ReactionType; index: number; size: number; current: ReactionType | null; reduceMotion: boolean };

/** One emoji. Hover and "chosen" are read from shared values on the UI thread: no React re-render per frame. */
function EmojiItem({ type, index, size, current, reduceMotion }: ItemProps) {
  const motion = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ translateY: 0 }, { scale: 1 }] };
    const hovered = hoverIndex.value;
    const chosen = selectedIndex.value === index;
    const scale = chosen ? CHOSEN_SCALE : hovered === index ? HOVER_SCALE : hovered >= 0 ? OTHERS_SCALE : 1;
    return {
      transform: [
        { translateY: withSpring(hovered === index || chosen ? HOVER_RISE : 0, SPRING) },
        { scale: withSpring(scale, SPRING) },
      ],
    };
  });
  // Reduced motion: a highlight behind the hovered emoji instead of scaling.
  const highlight = useAnimatedStyle(() => ({
    opacity: reduceMotion && (hoverIndex.value === index || selectedIndex.value === index) ? 1 : 0,
  }));

  return (
    <Animated.View entering={reduceMotion ? undefined : ZoomIn.springify().damping(11).stiffness(260).delay(index * STAGGER_MS)}>
      <Pressable
        onPress={() => selectFromPicker(index)}
        accessibilityRole="menuitem"
        accessibilityLabel={REACTIONS[type].label}
        accessibilityState={{ selected: current === type }}
        style={{ width: size, height: size }}
        className={`items-center justify-center rounded-full ${current === type ? 'border border-accent' : ''}`}
      >
        <Animated.View style={[StyleSheet.absoluteFill, highlight]} className="rounded-full bg-surface2" />
        <Animated.View style={motion}>
          <Image source={REACTIONS[type].image} style={{ width: IMAGE, height: IMAGE }} contentFit="contain" cachePolicy="memory" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** The hovered emoji's name above the row; all six are rendered and only their opacity animates. */
function HoverLabel({ type, index, centerX, top }: { type: ReactionType; index: number; centerX: number; top: number }) {
  const style = useAnimatedStyle(() => ({ opacity: withTiming(hoverIndex.value === index ? 1 : 0, { duration: 90 }) }));
  return (
    <Animated.Text
      pointerEvents="none"
      style={[{ position: 'absolute', top, left: centerX - 40, width: 80, textAlign: 'center' }, style]}
      className="rounded-full bg-text py-1 text-xs font-bold text-bg"
    >
      {REACTIONS[type].label}
    </Animated.Text>
  );
}

/**
 * The reaction picker, drawn once at the app root above every list (no Modal, no
 * clipping by FlashList cells). While the finger is down it ignores touches (the
 * button's gesture owns them); after a lift it takes touches: emoji are tappable
 * and a tap anywhere else closes it.
 */
export function ReactionPickerOverlay() {
  const { anchor, current, mode } = useReactionPickerStore();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const layout = anchor ? pickerLayout(anchor, width, insets.top) : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={layout && mode === 'tap' ? 'auto' : 'none'}>
      {layout && mode === 'tap' ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closePicker}
          accessibilityRole="button"
          accessibilityLabel="Close reactions"
        />
      ) : null}
      {layout ? (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(120) : cardEntering}
          exiting={FadeOut.duration(100)}
          style={{
            position: 'absolute',
            left: layout.card.x,
            top: layout.card.y,
            width: layout.card.width,
            height: layout.card.height,
            backgroundColor: colors.surface1,
            borderColor: colors.hairline,
            shadowColor: '#000000',
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
          className="flex-row items-center gap-1.5 rounded-full border px-2"
          accessibilityRole="menu"
          accessibilityLabel="Choose a reaction"
        >
          {REACTION_TYPES.map((type, i) => (
            <EmojiItem key={type} type={type} index={i} size={layout.itemSize} current={current} reduceMotion={reduceMotion} />
          ))}
        </Animated.View>
      ) : null}
      {layout
        ? REACTION_TYPES.map((type, i) => {
            const item = layout.items[i];
            return item ? (
              <HoverLabel key={type} type={type} index={i} centerX={item.x + item.width / 2} top={layout.card.y - 26} />
            ) : null;
          })
        : null}
    </View>
  );
}
