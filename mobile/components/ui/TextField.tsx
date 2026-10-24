import { type ReactNode, useState } from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  accessory?: ReactNode;
  /** Shows "length/max" next to the label; turns red past max. */
  counter?: { length: number; max: number };
  /**
   * Multiline only. Android ("pan" keyboard mode) pans just far enough to show the focused
   * input's own bounds, so the bounds reach this far below the visible box and whatever sits
   * there (e.g. a submit button) stays above the keyboard. Same technique as CommentComposer;
   * the visible size is unchanged (padding + negative margin).
   */
  keyboardGap?: number;
};

// Matches the multiline box (min-h-32 with py-3) when keyboardGap moves the padding onto the input.
const MULTILINE_MIN_H = 128;
const MULTILINE_PAD_Y = 12;

export function TextField({ label, error, hint, accessory, counter, keyboardGap = 0, onFocus, onBlur, ...input }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-danger' : focused ? 'border-accent' : 'border-hairline';
  const multiline = !!input.multiline;
  const gap = multiline ? keyboardGap : 0;
  const box = multiline ? (gap > 0 ? 'items-start' : 'min-h-32 items-start py-3') : 'h-12 items-center';
  const gapStyle =
    gap > 0
      ? {
          minHeight: MULTILINE_MIN_H + gap,
          paddingTop: MULTILINE_PAD_Y,
          paddingBottom: MULTILINE_PAD_Y + gap,
          marginBottom: -gap,
        }
      : undefined;

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">{label}</Text>
        {counter ? (
          <Text
            className={`text-xs ${counter.length > counter.max ? 'text-danger' : 'text-text-dim'}`}
            accessibilityLabel={`${counter.length} of ${counter.max} characters`}
          >
            {counter.length}/{counter.max}
          </Text>
        ) : null}
      </View>
      <View className={`flex-row rounded-xl border bg-surface2 px-4 ${box} ${border}`}>
        <TextInput
          {...input}
          accessibilityLabel={input.accessibilityLabel ?? label}
          accessibilityHint={error ?? input.accessibilityHint}
          placeholderTextColor={colors.textDim}
          selectionColor={colors.accent}
          textAlignVertical={multiline ? 'top' : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={gapStyle}
          className={
            multiline ? `${gap > 0 ? '' : 'min-h-24 '}flex-1 text-base leading-6 text-text` : 'h-full flex-1 text-base text-text'
          }
        />
        {accessory}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : typeof hint === 'string' ? (
        <Text className="text-sm text-text-dim">{hint}</Text>
      ) : (
        hint
      )}
    </View>
  );
}
