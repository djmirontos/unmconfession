import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useTheme } from '@/hooks/useTheme';
import { type Badge, badgeStyle } from '@/lib/badges';
import { formatManilaDay } from '@/lib/manilaDate';

/** Bottom sheet with one badge: icon, name, what it means and, for earned badges, when. `loading`: name known, the rest still on its way. */
export function BadgeSheet({ badge, loading = false, onClose }: { badge: Badge | null; loading?: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const style = badge ? badgeStyle(badge.code) : null;

  return (
    <Modal visible={badge !== null} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close badge" />
        <View
          className="gap-4 rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="h-1 w-10 self-center rounded-full bg-hairline" />
          {badge && style ? (
            <View className="items-center gap-3 px-2">
              <View className="size-16 items-center justify-center rounded-full bg-surface2">
                <Ionicons name={style.icon} size={32} color={colors[style.tone]} />
              </View>
              <Text accessibilityRole="header" className="text-center text-xl font-bold text-text">
                {badge.name}
              </Text>
              {loading ? (
                <View className="w-full items-center gap-2" accessibilityLabel="Loading badge" accessibilityRole="progressbar">
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="40%" height={12} />
                </View>
              ) : null}
              {!loading && badge.description ? <Text className="text-center text-base text-text-dim">{badge.description}</Text> : null}
              {!loading && badge.earnedAt && !style.staff ? (
                <Text className="text-center text-sm text-text-dim">Earned {formatManilaDay(badge.earnedAt)}</Text>
              ) : null}
            </View>
          ) : null}
          <Button label="Close" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
