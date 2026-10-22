import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Centered icon + message, used for empty lists and "not found". */
export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  const { colors } = useTheme();
  return (
    <View className="items-center gap-2 px-6 py-16">
      <Ionicons name={icon} size={40} color={colors.textDim} />
      <Text className="text-center text-lg font-bold text-text">{title}</Text>
      {message ? <Text className="text-center text-sm text-text-dim">{message}</Text> : null}
    </View>
  );
}

/** Full error state when nothing is cached yet. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="items-center gap-3 px-6 py-16">
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textDim} />
      <Text className="text-center text-base text-text">{message}</Text>
      <Button label="Retry" variant="secondary" icon="refresh" onPress={onRetry} />
    </View>
  );
}

/** Small banner above cached content when a background refresh failed. */
export function RefreshErrorBanner({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel="Couldn't refresh. Tap to retry"
      className="flex-row items-center gap-2 rounded-xl border border-hairline bg-surface2 px-3 py-2"
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.textDim} />
      <Text className="flex-1 text-sm text-text-dim">Couldn&apos;t refresh</Text>
      <Text className="text-sm font-bold text-text">Retry</Text>
    </Pressable>
  );
}

/** Footer: a skeleton-free "loading more" hint, or the end of the list. */
export function ListFooter({ loadingMore, reachedEnd, endLabel }: { loadingMore: boolean; reachedEnd: boolean; endLabel: string }) {
  if (loadingMore) {
    return <Text className="py-6 text-center text-sm text-text-dim">Loading more…</Text>;
  }
  if (reachedEnd) {
    return <Text className="py-6 text-center text-sm text-text-dim">{endLabel}</Text>;
  }
  return <View className="h-6" />;
}
