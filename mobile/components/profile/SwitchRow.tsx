import { Switch, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** A settings row with a label, a short help line and a switch (notification preferences, push). */
export function SwitchRow({
  label,
  help,
  value,
  disabled,
  first,
  dimmed = false,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  disabled: boolean;
  first: boolean;
  /** Visibly off (e.g. push types while the master switch is off). */
  dimmed?: boolean;
  onChange: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className={`min-h-16 flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-hairline'} ${dimmed ? 'opacity-50' : ''}`}>
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-bold text-text">{label}</Text>
        <Text className="text-sm text-text-dim">{help}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={help}
        trackColor={{ false: colors.hairline, true: colors.accent }}
        thumbColor={colors.surface1}
        ios_backgroundColor={colors.hairline}
      />
    </View>
  );
}
