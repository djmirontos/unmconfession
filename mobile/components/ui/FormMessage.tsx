import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = { tone: 'error' | 'success'; message: string | null };

/** Form-level error/success banner, announced to screen readers. */
export function FormMessage({ tone, message }: Props) {
  const { colors } = useTheme();
  if (!message) return null;
  const isError = tone === 'error';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`flex-row items-start gap-2 rounded-xl border px-4 py-3 ${isError ? 'border-danger bg-danger/10' : 'border-success bg-success/10'}`}
    >
      <Ionicons
        name={isError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={18}
        color={isError ? colors.danger : colors.success}
      />
      <Text className={`flex-1 text-sm ${isError ? 'text-danger' : 'text-success'}`}>{message}</Text>
    </View>
  );
}
