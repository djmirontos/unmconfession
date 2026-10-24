import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** "⋯" button that opens an own-item menu. */
export function MoreButton({ onPress, accessibilityLabel = 'More options' }: { onPress: () => void; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface2"
    >
      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textDim} />
    </Pressable>
  );
}
