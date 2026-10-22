import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accessibilityLabel: string;
  children: ReactNode;
  error?: string;
};

export function Checkbox({ checked, onChange, accessibilityLabel, children, error }: Props) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <View className="flex-row items-start gap-3">
        <Pressable
          onPress={() => onChange(!checked)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ checked }}
          className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${checked ? 'border-accent bg-accent' : error ? 'border-danger' : 'border-hairline bg-surface2'}`}
        >
          {checked ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
        </Pressable>
        <View className="flex-1">{children}</View>
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
