import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = { checked: boolean; onChange: (checked: boolean) => void; label: string };

/**
 * Box + label sized to its content, for filter rows. The whole control is one 44 px
 * target. (Checkbox is for full-width form rows: its label takes the remaining width.)
 */
export function InlineCheckbox({ checked, onChange, label }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      className="min-h-11 flex-row items-center gap-2 active:opacity-80"
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-accent bg-accent' : 'border-hairline bg-surface2'}`}
      >
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
      </View>
      <Text className="text-sm text-text">{label}</Text>
    </Pressable>
  );
}
