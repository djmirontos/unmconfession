import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { type AccessibilityActionEvent, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { closePicker, selectFromPicker } from '@/components/reactions/pickerActions';
import { hitTest, pickerLayout } from '@/components/reactions/pickerLayout';
import { cardRect, everHovered, resetPickerShared, setCardRect, trackHover } from '@/components/reactions/pickerShared';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/hooks/useTheme';
import { REACTION_TYPES, REACTIONS, type ReactionType } from '@/lib/reactions';
import { useReactionPickerStore } from '@/stores/reactionPickerStore';

const HOLD_MS = 350;

type Props = {
  myReaction: ReactionType | null;
  /** Total reactions, for the screen-reader label (the visible total is TopReactions). */
  count: number;
  /** The wanted reaction (null = remove). Callers send it through their latest-only sync. */
  onChange: (next: ReactionType | null) => void;
  disabled?: boolean;
  /** Comments: smaller and quieter, count hidden at 0, comment wording for screen readers. */
  compact?: boolean;
};

/**
 * Facebook-style reaction button. Tap: like, or remove my reaction. Hold 350 ms:
 * the picker opens and this gesture owns the touch (the list cannot steal it);
 * drag over an emoji and release to pick it, or release without hovering any and
 * tap one. Picking my current reaction removes it. A finger that moves before the
 * hold fires fails the gesture, so the list scrolls normally.
 */
export function ReactionButton({ myReaction, count, onChange, disabled = false, compact = false }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const reduceMotion = useReducedMotion();
  // Button size from layout; its position comes from the gesture event (same coordinates as the hit-test).
  const size = useSharedValue({ width: 0, height: 0 });

  const pick = (type: ReactionType) => onChange(myReaction === type ? null : type);

  const openPicker = (x: number, y: number, w: number, h: number) => {
    if (!requireAuth('react')) return; // guests: sign-in sheet, no picker
    const anchor = { x, y, width: w, height: h };
    resetPickerShared();
    setCardRect(pickerLayout(anchor, width, insets.top).card);
    useReactionPickerStore.getState().open(anchor, myReaction, pick);
  };

  const onRelease = (index: number, hovered: boolean) => {
    if (!useReactionPickerStore.getState().anchor) return;
    if (index >= 0) selectFromPicker(index);
    else if (!hovered) useReactionPickerStore.getState().setMode('tap'); // never hovered: let them tap one
    else closePicker(); // dragged out and let go: no change
  };

  const onTap = () => {
    if (requireAuth('react')) onChange(myReaction === null ? 'like' : null);
  };

  const hold = Gesture.Pan()
    .enabled(!disabled)
    .activateAfterLongPress(HOLD_MS)
    .onStart((e) => {
      // Button origin in root coordinates = finger position minus its offset inside the button.
      scheduleOnRN(openPicker, e.absoluteX - e.x, e.absoluteY - e.y, size.value.width, size.value.height);
    })
    .onUpdate((e) => {
      trackHover(hitTest(cardRect.value, e.absoluteX, e.absoluteY));
    })
    .onEnd((e, success) => {
      if (!success) {
        scheduleOnRN(closePicker);
        return;
      }
      scheduleOnRN(onRelease, hitTest(cardRect.value, e.absoluteX, e.absoluteY), everHovered.value);
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(HOLD_MS)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(onTap);
    });

  // The hold wins; a quick tap resolves as soon as the hold fails on release.
  const gesture = Gesture.Exclusive(hold, tap);

  // Small pop on the button's emoji when a reaction is set or changed.
  const pop = useSharedValue(1);
  const previous = useRef(myReaction);
  useEffect(() => {
    if (myReaction !== null && myReaction !== previous.current && !reduceMotion) {
      pop.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 260 }));
    }
    previous.current = myReaction;
  }, [myReaction, reduceMotion, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const reaction = myReaction ? REACTIONS[myReaction] : null;
  const label = compact
    ? reaction
      ? `Your reaction: ${reaction.label}, ${count} reactions`
      : `React to comment, ${count} reactions`
    : reaction
      ? `You reacted ${reaction.label}, ${count} reactions`
      : `Like, ${count} reactions`;

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (disabled || !requireAuth('react')) return;
    const name = e.nativeEvent.actionName;
    if (name === 'activate') onChange(myReaction === null ? 'like' : null);
    const type = REACTION_TYPES.find((t) => t === name);
    if (type) onChange(myReaction === type ? null : type);
  };

  const icon = compact ? 16 : 20;

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        onLayout={(e) => {
          size.value = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Hold to choose a reaction"
        accessibilityState={{ disabled, selected: myReaction !== null }}
        accessibilityActions={[
          { name: 'activate' },
          ...REACTION_TYPES.map((t) => ({ name: t, label: `React ${REACTIONS[t].label}` })),
        ]}
        onAccessibilityAction={onAccessibilityAction}
        className={
          compact
            ? `min-h-11 flex-row items-center gap-1 self-start rounded-full px-2 ${disabled ? 'opacity-50' : ''}`
            : `h-9 flex-row items-center gap-1.5 rounded-full px-3 ${disabled ? 'opacity-50' : ''}`
        }
      >
        {reaction ? (
          <Animated.View style={popStyle}>
            <Image source={reaction.image} style={{ width: icon, height: icon }} contentFit="contain" />
          </Animated.View>
        ) : (
          <Ionicons name="thumbs-up-outline" size={compact ? 15 : 18} color={colors.textDim} />
        )}
        <Text className={`${compact ? 'text-xs' : 'text-sm'} font-bold ${reaction ? 'text-accent' : 'text-text-dim'}`}>
          {reaction ? reaction.label : 'Like'}
        </Text>
        {/* The total is shown by TopReactions next to the button; `count` is only for the label. */}
      </View>
    </GestureDetector>
  );
}
