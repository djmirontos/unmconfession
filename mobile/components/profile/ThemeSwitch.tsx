import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { type ThemePreference, useThemeStore } from '@/stores/themeStore';

const OPTIONS: { value: ThemePreference; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export function ThemeSwitch() {
  const { colors, preference } = useTheme();
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <View className="flex-row rounded-xl border border-hairline bg-surface2 p-1" accessibilityRole="radiogroup" accessibilityLabel="Theme">
      {OPTIONS.map((option) => {
        const selected = option.value === preference;
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${option.label} theme`}
            accessibilityState={{ selected }}
            className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg ${selected ? 'bg-accent' : ''}`}
          >
            <Ionicons name={option.icon} size={16} color={selected ? colors.onAccent : colors.textDim} />
            <Text className={`text-sm font-bold ${selected ? 'text-on-accent' : 'text-text-dim'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
