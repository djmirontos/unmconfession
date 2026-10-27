import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** Shown on Sell and Lost & Found forms. */
export function MarketNotice() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-3 rounded-xl border border-hairline bg-surface2 p-3">
      <Ionicons name="information-circle-outline" size={20} color={colors.textDim} />
      <View className="flex-1 gap-1">
        <Text className="text-sm text-text">
          No payments in the app. Deals are between buyer and seller; meet in a safe, public place.
        </Text>
        <Text className="text-sm text-text-dim">
          Alcohol, cigarettes and vapes, medicine, drugs and weapons are not allowed. See the{' '}
          <Text
            accessibilityRole="link"
            onPress={() => router.push('/legal/terms')}
            className="font-bold text-text underline"
          >
            Terms
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}
