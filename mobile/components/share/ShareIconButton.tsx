import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable } from 'react-native';

import { useIsSharing } from '@/hooks/useShareCard';
import { useTheme } from '@/hooks/useTheme';

/** Header share icon (same size as the "⋯" button: 36 px + 10 px hit slop). Spins while its card is made. */
export function ShareIconButton({ shareKey, onPress }: { shareKey: string; onPress: () => void }) {
  const { colors } = useTheme();
  const busy = useIsSharing(shareKey);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Share"
      accessibilityState={{ busy, disabled: busy }}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface2"
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textDim} />
      ) : (
        <Ionicons name="share-social-outline" size={20} color={colors.textDim} />
      )}
    </Pressable>
  );
}
