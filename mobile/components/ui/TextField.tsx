import { type ReactNode, useState } from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  accessory?: ReactNode;
};

export function TextField({ label, error, hint, accessory, onFocus, onBlur, ...input }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-danger' : focused ? 'border-accent' : 'border-hairline';

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">{label}</Text>
      <View className={`h-12 flex-row items-center rounded-xl border bg-surface2 px-4 ${border}`}>
        <TextInput
          {...input}
          accessibilityLabel={input.accessibilityLabel ?? label}
          accessibilityHint={error ?? input.accessibilityHint}
          placeholderTextColor={colors.textDim}
          selectionColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className="h-full flex-1 text-base text-text"
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
