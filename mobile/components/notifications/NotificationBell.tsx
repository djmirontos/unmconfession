import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useMembership } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { formatBadge, useUnreadNotifications } from '@/hooks/useUnreadNotifications';

/** Small accent count pill ("1".."99+"); renders nothing at 0. */
export function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <View className={`h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 ${className}`}>
      <Text className="text-[11px] font-bold text-on-accent">{formatBadge(count)}</Text>
    </View>
  );
}

/** Feed header bell with the unread badge. Members only. */
export function NotificationBell() {
  const router = useRouter();
  const { colors } = useTheme();
  const member = useMembership().status === 'member';
  const unread = useUnreadNotifications();
  if (!member) return null;

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-surface2"
    >
      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={24} color={colors.text} />
      <View className="absolute right-0.5 top-0.5" pointerEvents="none">
        <CountBadge count={unread} />
      </View>
    </Pressable>
  );
}
