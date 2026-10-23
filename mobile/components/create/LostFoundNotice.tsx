import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** Lost & Found safety tip, same style as MarketNotice. */
export function LostFoundNotice() {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-3 rounded-xl border border-hairline bg-surface2 p-3">
      <Ionicons name="shield-checkmark-outline" size={20} color={colors.textDim} />
      <Text className="flex-1 text-sm text-text">
        Don&apos;t post phone numbers or ID numbers. Interested people will reach you through comments. When posting a
        found item, leave out one detail (for example, the name on a card) so the real owner can prove it is theirs.
      </Text>
    </View>
  );
}
