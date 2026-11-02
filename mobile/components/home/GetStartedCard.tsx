import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { GetStartedView } from '@/hooks/useGetStarted';
import { useTheme } from '@/hooks/useTheme';
import {
  GET_STARTED_COPY as COPY,
  GET_STARTED_GOAL,
  getStartedProgressA11y,
  getStartedProgressLabel,
} from '@/lib/getStarted';

type Props = { view: Exclude<GetStartedView, { phase: 'hidden' }>; onDismiss: () => void };

/** Home feed header, below the announcement: "react to 3 posts", then a short success state. */
export function GetStartedCard({ view, onDismiss }: Props) {
  const { colors } = useTheme();
  const done = view.phase === 'done';
  const count = view.phase === 'progress' ? view.count : GET_STARTED_GOAL;
  const spoken = done ? COPY.done : getStartedProgressA11y(count);

  // Android reads the live regions below; iOS needs an explicit announcement. Changes only, not the first render.
  const lastSpoken = useRef(spoken);
  useEffect(() => {
    if (lastSpoken.current === spoken) return;
    lastSpoken.current = spoken;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(250)}
      className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4"
      accessibilityRole="summary"
    >
      {done ? (
        <View className="flex-row items-center gap-2 pr-8">
          <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
          <Text accessibilityLiveRegion="polite" className="flex-1 text-base font-bold text-text">
            {COPY.done}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row items-center gap-2 pr-8">
            <Ionicons name="sparkles" size={16} color={colors.accent} />
            <Text accessibilityRole="header" className="text-xs font-bold uppercase tracking-widest text-accent">
              {COPY.title}
            </Text>
          </View>
          <Text className="text-sm leading-5 text-text">{COPY.body}</Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-1 flex-row gap-1.5" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {Array.from({ length: GET_STARTED_GOAL }, (_, i) => (
                <View key={i} className={`h-1.5 flex-1 rounded-full ${i < count ? 'bg-accent' : 'bg-surface2'}`} />
              ))}
            </View>
            <Text
              accessibilityLabel={spoken}
              accessibilityLiveRegion="polite"
              className="text-xs font-bold text-accent"
            >
              {getStartedProgressLabel(count)}
            </Text>
          </View>
        </>
      )}
      {/* 44 x 44 tap area in the corner, as on the announcement card. */}
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={COPY.dismiss}
        className="absolute right-0.5 top-0.5 h-11 w-11 items-center justify-center rounded-full active:opacity-60"
      >
        <Ionicons name="close" size={18} color={colors.textDim} />
      </Pressable>
    </Animated.View>
  );
}
