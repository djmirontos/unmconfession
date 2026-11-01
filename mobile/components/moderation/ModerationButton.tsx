import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CountBadge } from '@/components/notifications/NotificationBell';
import { useOpenReportCount } from '@/hooks/useOpenReportCount';
import { useStaff } from '@/hooks/useStaff';
import { useTheme } from '@/hooks/useTheme';
import { formatOpenReportsLabel } from '@/lib/moderation';

/** Home header shield for staff, next to the bell (same size and badge); the count is items with open reports. */
export function ModerationButton() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isStaff } = useStaff();
  const count = useOpenReportCount().data ?? 0;
  if (!isStaff) return null;

  return (
    <Pressable
      onPress={() => router.push('/moderation')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={formatOpenReportsLabel(count)}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-surface2"
    >
      <Ionicons name="shield-half-outline" size={24} color={colors.text} />
      <View className="absolute right-0.5 top-0.5" pointerEvents="none">
        <CountBadge count={count} />
      </View>
    </Pressable>
  );
}
