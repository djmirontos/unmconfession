import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';

export const CODE_LENGTH = 6;

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** Wrong or expired code: every box turns red until the next edit. */
  invalid?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  ref?: Ref<CodeInputHandle>;
};

export type CodeInputHandle = { focus: () => void };

const BOXES = Array.from({ length: CODE_LENGTH }, (_, i) => i);

/** Keeps digits only and cuts to the code length, so a pasted code fills every box. */
export function sanitizeCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

function Caret() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1);
  }, [reduceMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 2, height: 24, borderRadius: 1, backgroundColor: colors.navy }, style]} />;
}

/**
 * One hidden numeric TextInput drawn as six boxes. The input covers the boxes
 * (invisible), so a tap anywhere focuses it and long-press shows the paste menu.
 */
export function CodeInput({ value, onChange, invalid = false, editable = true, autoFocus = true, ref }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <View className="relative">
      <View
        className="flex-row gap-2"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {BOXES.map((i) => {
          const digit = value[i] ?? '';
          const isActive = focused && editable && i === activeIndex && !invalid;
          const border = invalid ? 'border-danger' : isActive ? 'border-navy' : 'border-hairline';
          return (
            <View
              key={i}
              className={`h-14 flex-1 items-center justify-center rounded-xl border-2 bg-surface2 ${border}`}
            >
              {digit ? (
                <Text className="text-2xl font-bold text-text">{digit}</Text>
              ) : isActive ? (
                <Caret />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(sanitizeCode(text))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        // iOS suggests codes from Mail above the keyboard; Android's email OTP hint.
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'email-otp' : 'one-time-code'}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={`Verification code, ${CODE_LENGTH} digits`}
        accessibilityHint={invalid ? 'The code is wrong or expired.' : undefined}
        className="absolute inset-0"
        style={{ color: 'transparent', opacity: 0.02 }}
      />
    </View>
  );
}
