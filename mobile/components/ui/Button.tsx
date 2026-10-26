import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  accessibilityHint?: string;
};

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-accent',
  secondary: 'border border-hairline bg-surface2',
  ghost: 'bg-transparent',
  danger: 'border border-danger bg-transparent',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-on-accent',
  secondary: 'text-text',
  ghost: 'text-text',
  danger: 'text-danger',
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, accessibilityHint }: Props) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const contentColor = { primary: colors.onAccent, secondary: colors.text, ghost: colors.text, danger: colors.danger }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      className={`min-h-12 flex-row items-center justify-center rounded-xl px-5 py-3 active:opacity-80 ${CONTAINER[variant]} ${inactive ? 'opacity-60' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        // shrink: a long label (or large system font) wraps and the button grows instead of clipping.
        <View className="shrink flex-row items-center gap-2">
          {icon ? <Ionicons name={icon} size={18} color={contentColor} /> : null}
          <Text className={`shrink text-center text-base font-bold tracking-wide ${LABEL[variant]}`}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
