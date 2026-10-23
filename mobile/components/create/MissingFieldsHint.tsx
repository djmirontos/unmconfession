import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** "Still needed: Title, Price" under the Post button; nothing when the list is empty. */
export function MissingFieldsHint({ missing }: { missing: readonly string[] }) {
  const { colors } = useTheme();
  if (missing.length === 0) return null;
  return (
    <View className="flex-row items-center justify-center gap-1.5" accessibilityLiveRegion="polite">
      <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
      <Text className="shrink text-sm text-text-dim">Still needed: {missing.join(', ')}</Text>
    </View>
  );
}
