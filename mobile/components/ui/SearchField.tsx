import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  maxLength: number;
};

/** Single-line search box with a magnifier and a clear (X) button. */
export function SearchField({ value, onChangeText, placeholder, maxLength }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      className={`h-11 flex-row items-center gap-2 rounded-xl border bg-surface2 pl-3 ${focused ? 'border-accent' : 'border-hairline'}`}
    >
      <Ionicons name="search" size={18} color={colors.textDim} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        maxLength={maxLength}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        placeholderTextColor={colors.textDim}
        selectionColor={colors.accent}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="h-full flex-1 text-base text-text"
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          className="h-full justify-center px-3"
        >
          <Ionicons name="close-circle" size={18} color={colors.textDim} />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </View>
  );
}
